#version 410 core

#include "uniforms.glsl"

uniform sampler2D BaseMap;
uniform sampler2D NormalMap;
uniform sampler2D GlowMap;
uniform sampler2D HeightMap;
uniform samplerCube CubeMap;
uniform sampler2D EnvironmentMap;

// bits 0 to 2: color mode
// bit 3: lighting mode
// bits 4 to 5: vertex mode
uniform int vertexColorFlags;

uniform bool isEffect;
uniform bool hasSpecular;
uniform bool hasEmit;
uniform bool hasGlowMap;
uniform bool hasCubeMap;
uniform bool hasCubeMask;
uniform float cubeMapScale;
// <= 0: disabled, 1: simple parallax mapping using BaseMap.a, >= 2: POM using HeightMap.r
uniform int parallaxMaxSteps;
uniform float parallaxScale;
uniform float glowMult;
uniform vec4 glowColor;

uniform float alpha;
uniform int alphaTestFunc;
uniform float alphaThreshold;

uniform vec2 uvCenter;
uniform vec2 uvScale;
uniform vec2 uvOffset;
uniform float uvRotation;

uniform vec4 falloffParams;

uniform vec4 frontMaterialDiffuse;
uniform vec4 frontMaterialSpecular;
uniform vec4 frontMaterialAmbient;
uniform vec4 frontMaterialEmission;
uniform float frontMaterialShininess;

in mat3 reflMatrix;

in vec3 LightDir;
in vec3 ViewDir;

in vec2 texCoord;

flat in vec4 A;
in vec4 C;
flat in vec4 D;

out vec4 fragColor;


vec3 tonemap(vec3 x)
{
	float a = 0.15;
	float b = 0.50;
	float c = 0.10;
	float d = 0.20;
	float e = 0.02;
	float f = 0.30;

	vec3 z = x * x * D.a * (A.a * 4.22978723);
	z = (z * (a * z + b * c) + d * e) / (z * (a * z + b) + d * f) - e / f;
	return sqrt(z / (A.a * 0.93333333));
}

// parallax occlusion mapping based on code from
// https://web.archive.org/web/20150419215321/http://sunandblackcat.com/tipFullView.php?l=eng&topicid=28

vec2 parallaxMapping( vec3 V, vec2 offset )
{
	if ( parallaxMaxSteps < 2 )
		return offset + V.xy * ( ( 0.5 - texture( BaseMap, offset ).a ) * parallaxScale );

	// determine optimal height of each layer
	float	layerHeight = 1.0 / mix( max( float(parallaxMaxSteps), 4.0 ), 4.0, abs(V.z) );

	// current height of the layer
	float	curLayerHeight = 1.0;
	vec2	dtex = parallaxScale * V.xy / max( abs(V.z), 0.02 );
	// current texture coordinates
	vec2	currentTextureCoords = offset + ( dtex * 0.5 );
	// shift of texture coordinates for each layer
	dtex *= layerHeight;

	// height from heightmap
	float	heightFromTexture = texture( HeightMap, currentTextureCoords ).r;

	// while point is above the surface
	while ( curLayerHeight > heightFromTexture ) {
		// to the next layer
		curLayerHeight -= layerHeight;
		// shift of texture coordinates
		currentTextureCoords -= dtex;
		// new height from heightmap
		heightFromTexture = texture( HeightMap, currentTextureCoords ).r;
	}

	// previous texture coordinates
	vec2	prevTCoords = currentTextureCoords + dtex;

	// heights for linear interpolation
	float	nextH = curLayerHeight - heightFromTexture;
	float	prevH = curLayerHeight + layerHeight - texture( HeightMap, prevTCoords ).r;

	// proportions for linear interpolation
	float	weight = nextH / ( nextH - prevH );

	// return interpolation of texture coordinates
	return mix( currentTextureCoords, prevTCoords, weight );
}

void main()
{
	vec3 L = normalize( LightDir );
	vec3 E = normalize( ViewDir );

	vec2 offset = texCoord.st - uvCenter;
	float r_c = cos( uvRotation );
	float r_s = sin( uvRotation ) * -1.0;
	offset = vec2( offset.x * r_c - offset.y * r_s, offset.x * r_s + offset.y * r_c ) * uvScale + uvCenter + uvOffset;
	if ( parallaxMaxSteps >= 1 && parallaxScale >= 0.0005 )
		offset = parallaxMapping( E, offset );

	vec4 baseMap = texture( BaseMap, offset );
	vec4 color = baseMap;

	if ( isEffect ) {
		float alphaMult = glowColor.a * glowColor.a;

		if ( falloffParams.y != falloffParams.x ) {
			// TODO: When X and Y are both 0.0 or both 1.0 the effect is reversed.
			float falloff = smoothstep( falloffParams.y, falloffParams.x, abs(E.z) );
			falloff = mix( max(falloffParams.w, 0.0), min(falloffParams.z, 1.0), falloff );
			alphaMult *= falloff;
		}

		color *= C;
		color.rgb = color.rgb * glowColor.rgb * glowMult;
		color.a = color.a * alphaMult;
	} else {
		vec4 normalMap = texture( NormalMap, offset );

		vec3 normal = normalize( normalMap.rgb * 2.0 - 1.0 );

		vec3 R = reflect( -L, normal );
		vec3 H = normalize( L + E );
		float NdotL = max( dot(normal, L), 0.0 );

		if ( ( vertexColorFlags & 0x28 ) == 0x28 ) {
			color *= C;
			color.rgb *= A.rgb + ( D.rgb * NdotL );
		} else if ( ( vertexColorFlags & 0x08 ) != 0 ) {
			color.rgb *= ( A.rgb * frontMaterialAmbient.rgb ) + ( D.rgb * frontMaterialDiffuse.rgb * NdotL );
			color.a *= min( frontMaterialAmbient.a + frontMaterialDiffuse.a, 1.0 );
		} else {
			color.rgb *= A.rgb + ( D.rgb * NdotL );
		}


		// Environment
		if ( hasCubeMap && cubeMapScale > 0.0 ) {
			vec3 R = reflect( -E, normal );
			vec3 reflectedWS = reflMatrix * R;
			vec3 cube = texture( CubeMap, reflectedWS ).rgb;
			if ( hasCubeMask )
				cube *= texture( EnvironmentMap, offset ).r * cubeMapScale;
			else
				cube *= normalMap.a * cubeMapScale;
			color.rgb += cube * A.rgb * ( 1.0 / 0.375 );
		}

		// Emissive
		vec3 emissive = glowColor.rgb * ( glowMult * glowScaleSRGB );
		if ( ( vertexColorFlags & 0x10 ) == 0 )
			emissive *= frontMaterialEmission.rgb * frontMaterialEmission.a;
		else
			emissive *= C.rgb;
		if ( hasGlowMap )
			color.rgb += emissive * baseMap.rgb * texture( GlowMap, offset ).rgb;
		else if ( hasEmit )
			color.rgb += emissive * baseMap.rgb;

		// Specular
		if ( hasSpecular && NdotL > 0.0 ) {
			float NdotH = dot( normal, H );
			if ( NdotH > 0.0 ) {
				vec3 spec = frontMaterialSpecular.rgb * pow( NdotH, frontMaterialShininess );
				color.rgb += spec * frontMaterialSpecular.a * normalMap.a;
			}
		}
	}

	color.a *= alpha;

	if ( alphaTestFunc > 0 ) {
		if ( color.a < alphaThreshold && alphaTestFunc != 1 && alphaTestFunc != 3 && alphaTestFunc != 5 )
			discard;
		if ( color.a == alphaThreshold && alphaTestFunc != 2 && alphaTestFunc != 3 && alphaTestFunc != 6 )
			discard;
		if ( color.a > alphaThreshold && ( alphaTestFunc < 4 || alphaTestFunc > 6 ) )
			discard;
	}

	fragColor = vec4( tonemap( color.rgb ), color.a );
}
