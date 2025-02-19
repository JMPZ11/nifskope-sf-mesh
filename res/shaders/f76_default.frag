#version 410 core

#include "uniforms.glsl"

uniform sampler2D BaseMap;
uniform sampler2D NormalMap;
uniform sampler2D GlowMap;
uniform sampler2D ReflMap;
uniform sampler2D LightingMap;
uniform sampler2D GreyscaleMap;
uniform sampler2D EnvironmentMap;	// environment BRDF LUT
uniform samplerCube CubeMap;	// pre-filtered cube maps (specular, diffuse)
uniform samplerCube CubeMap2;

uniform vec3 specColor;
uniform bool hasSpecular;
uniform float specStrength;
uniform float fresnelPower;

uniform float paletteScale;

uniform vec3 glowColor;
uniform float glowMult;

uniform float alpha;
uniform int alphaTestFunc;
uniform float alphaThreshold;

uniform vec3 tintColor;

uniform vec2 uvScale;
uniform vec2 uvOffset;

uniform bool hasEmit;
uniform bool hasGlowMap;
uniform bool hasSoftlight;
uniform bool hasTintColor;
uniform bool hasCubeMap;
uniform bool hasSpecularMap;
uniform bool greyscaleColor;

uniform float subsurfaceRolloff;
uniform float rimPower;
uniform float backlightPower;

uniform float envReflection;

in vec3 LightDir;
in vec3 ViewDir;

in vec2 texCoord;

in vec4 C;

in mat3 btnMatrix;
flat in mat3 reflMatrix;

out vec4 fragColor;

vec3 ViewDir_norm = normalize( ViewDir );
mat3 btnMatrix_norm = mat3( normalize( btnMatrix[0] ), normalize( btnMatrix[1] ), normalize( btnMatrix[2] ) );

#ifndef M_PI
	#define M_PI 3.1415926535897932384626433832795
#endif

#define FLT_EPSILON 1.192092896e-07F // smallest such that 1.0 + FLT_EPSILON != 1.0

vec3 LightingFuncGGX_REF(float NdotL, float NdotH, float NdotV, float roughness)
{
	float alpha = roughness * roughness;
	// D (GGX normal distribution)
	float alphaSqr = alpha * alpha;
	float denom = NdotH * NdotH;
	denom = ( denom * alphaSqr ) + ( 1.0 - denom );
	float D = alphaSqr / ( denom * denom * 4.0 );
	// no pi because BRDF -> lighting
	// G (remapped hotness, see Unreal Shading)
	float	k = (alpha + 2 * roughness + 1) / 8.0;
	float	G = NdotL / (mix(NdotL, 1, k) * mix(NdotV, 1, k));

	return vec3(D * G);
}

vec3 tonemap(vec3 x, float y)
{
	float a = 0.15;
	float b = 0.50;
	float c = 0.10;
	float d = 0.20;
	float e = 0.02;
	float f = 0.30;

	vec3 z = x * (y * 4.22978723);
	z = (z * (a * z + b * c) + d * e) / (z * (a * z + b) + d * f) - e / f;
	return z / (y * 0.93333333);
}

float srgbCompress(float x)
{
	float	y = sqrt(max(x, 0.0) + 0.000858025);
	return (((y * -0.18732371 + 0.59302883) * y - 0.79095451) * y + 1.42598062) * y - 0.04110602;
}

void main()
{
	vec2 offset = texCoord.st * uvScale + uvOffset;

	vec4	baseMap = texture(BaseMap, offset);

	vec4 color = baseMap;
	color.a = C.a * baseMap.a * alpha;
	if ( alphaTestFunc > 0 ) {
		if ( color.a < alphaThreshold && alphaTestFunc != 1 && alphaTestFunc != 3 && alphaTestFunc != 5 )
			discard;
		if ( color.a == alphaThreshold && alphaTestFunc != 2 && alphaTestFunc != 3 && alphaTestFunc != 6 )
			discard;
		if ( color.a > alphaThreshold && ( alphaTestFunc < 4 || alphaTestFunc > 6 ) )
			discard;
	}

	vec4	normalMap = texture(NormalMap, offset);
	vec4	lightingMap = vec4(0.25, 1.0, 0.0, 1.0);
	if ( hasSpecularMap )
		lightingMap = texture(LightingMap, offset);
	vec4	reflMap = texture(ReflMap, offset);
	vec4	glowMap = texture(GlowMap, offset);

	vec3 normal = normalMap.rgb;
	// Calculate missing blue channel
	normal.b = sqrt(max(1.0 - dot(normal.rg, normal.rg), 0.0));
	normal = normalize( btnMatrix_norm * normal );
	if ( !gl_FrontFacing )
		normal *= -1.0;

	vec3 L = normalize(LightDir);
	vec3 V = ViewDir_norm;
	vec3 R = reflect(-V, normal);
	vec3 H = normalize(L + V);

	float NdotL = dot(normal, L);
	float NdotL0 = max(NdotL, 0.0);
	float NdotH = clamp(dot(normal, H), 0.0, 1.0);
	float NdotV = abs(dot(normal, V));
	float LdotH = dot(L, H);

	vec3	reflectedWS = reflMatrix * R;
	vec3	normalWS = reflMatrix * normal;

	vec3 albedo = baseMap.rgb * C.rgb;
	if ( greyscaleColor ) {
		// work around incorrect format used by Fallout 76 grayscale textures
		albedo = textureLod(GreyscaleMap, vec2(srgbCompress(baseMap.g), paletteScale * C.r), 0.0).rgb;
	}

	// Emissive
	vec3 emissive = vec3(0.0);
	if ( hasEmit ) {
		emissive += glowColor * glowMult;
		if ( hasGlowMap ) {
			emissive *= glowMap.rgb;
		}
	} else if ( hasGlowMap ) {
		emissive += glowMap.rgb * glowMult;
	}
	emissive *= lightingMap.a * glowScale;

	vec3	f0 = max(reflMap.rgb, vec3(0.02));

	// Specular
	float	roughness = 1.0 - lightingMap.r;
	vec3	spec = LightingFuncGGX_REF(NdotL0, NdotH, NdotV, max(roughness, 0.02)) * lightSourceDiffuse[0].rgb;

	// Diffuse
	vec3	diffuse = vec3(NdotL0);
	// Fresnel
	vec2	fDirect = textureLod(EnvironmentMap, vec2(LdotH, NdotL0), 0.0).ba;
	spec *= mix(f0, vec3(1.0), fDirect.x);
	vec4	envLUT = textureLod(EnvironmentMap, vec2(NdotV, roughness), 0.0);
	vec2	fDiff = vec2(fDirect.y, envLUT.b);
	fDiff = fDiff * (LdotH * LdotH * roughness * 2.0 - 0.5) + 1.0;
	diffuse *= (vec3(1.0) - f0) * fDiff.x * fDiff.y;

	// Environment
	vec3	refl = vec3(0.0);
	vec3	ambient = lightSourceAmbient.rgb;
	if ( hasCubeMap ) {
		float	m = roughness * (roughness * -4.0 + 10.0);
		refl = textureLod(CubeMap, reflectedWS, max(m, 0.0)).rgb;
		refl *= envReflection * specStrength;
		refl *= ambient;
		ambient *= textureLod(CubeMap2, normalWS, 0.0).rgb;
	} else {
		ambient /= 15.0;
		refl = ambient;
	}
	vec3	f = mix(f0, vec3(1.0), envLUT.r);
	if (!hasSpecular) {
		albedo = max(albedo, reflMap.rgb);
		diffuse = vec3(NdotL0);
		spec = vec3(0.0);
		f = vec3(0.0);
	} else {
		float	fDiffEnv = envLUT.b * ((NdotV + 1.0) * roughness - 0.5) + 1.0;
		ambient *= (vec3(1.0) - f0) * fDiffEnv;
	}
	float	ao = lightingMap.g;
	refl *= f * envLUT.g * ao;

	//vec3 soft = vec3(0.0);
	//float wrap = NdotL;
	//if ( hasSoftlight || subsurfaceRolloff > 0.0 ) {
	//	wrap = (wrap + subsurfaceRolloff) / (1.0 + subsurfaceRolloff);
	//	soft = albedo * max(0.0, wrap) * smoothstep(1.0, 0.0, sqrt(NdotL0));
	//
	//	diffuse += soft;
	//}

	//if ( hasTintColor ) {
	//	albedo *= tintColor;
	//}

	// Diffuse
	color.rgb = diffuse * albedo * lightSourceDiffuse[0].rgb;
	// Ambient
	color.rgb += ambient * albedo * ao;
	// Specular
	color.rgb += spec;
	color.rgb += refl;

	// Emissive
	color.rgb += emissive;

	color.rgb = tonemap(color.rgb * brightnessScale, toneMapScale);

	fragColor = color;
}
