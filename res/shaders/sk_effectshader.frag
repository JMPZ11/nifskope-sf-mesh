#version 410 core

#include "uniforms.glsl"

uniform sampler2D BaseMap;
uniform sampler2D GreyscaleMap;

uniform bool hasSourceTexture;
uniform bool hasGreyscaleMap;
uniform bool greyscaleAlpha;
uniform bool greyscaleColor;

uniform bool useFalloff;
uniform bool vertexColors;
uniform bool vertexAlpha;

uniform bool hasWeaponBlood;

uniform vec4 glowColor;
uniform float glowMult;

uniform int alphaTestFunc;
uniform float alphaThreshold;

uniform vec2 uvScale;
uniform vec2 uvOffset;

uniform vec4 falloffParams;
uniform float falloffDepth;

in vec3 LightDir;
in vec3 ViewDir;

in vec2 texCoord;

in vec4 C;

in vec3 N;

out vec4 fragColor;

vec4 colorLookup( float x, float y ) {

	return texture( GreyscaleMap, vec2( clamp(x, 0.0, 1.0), clamp(y, 0.0, 1.0)) );
}

void main()
{
	vec4 baseMap = texture( BaseMap, texCoord.st * uvScale + uvOffset );

	vec4 color;

	vec3 normal = normalize( N );

	// Reconstructed normal
	//normal = normalize(cross(dFdy(v.xyz), dFdx(v.xyz)));

	vec3 E = normalize(ViewDir);

	float tmp2 = falloffDepth; // Unused right now

	// Falloff
	float falloff = 1.0;
	if ( useFalloff ) {
		float startO = min(falloffParams.z, 1.0);
		float stopO = max(falloffParams.w, 0.0);

		// TODO: When X and Y are both 0.0 or both 1.0 the effect is reversed.
		falloff = smoothstep( falloffParams.y, falloffParams.x, abs(E.b));

		falloff = mix( max(falloffParams.w, 0.0), min(falloffParams.z, 1.0), falloff );
	}

	float alphaMult = glowColor.a * glowColor.a;

	color.rgb = baseMap.rgb;
	color.a = baseMap.a;

	if ( hasWeaponBlood ) {
		color.rgb = vec3( 1.0, 0.0, 0.0 ) * baseMap.r;
		color.a = baseMap.a * baseMap.g;
	}

	color.rgb *= C.rgb * glowColor.rgb;
	color.a *= C.a * falloff * alphaMult;

	if ( greyscaleColor ) {
		// Only Red emissive channel is used
		float emRGB = glowColor.r;

		vec4 luG = colorLookup( baseMap.g, C.g * falloff * emRGB );

		color.rgb = luG.rgb;
	}

	if ( greyscaleAlpha ) {
		vec4 luA = colorLookup( baseMap.a, C.a * falloff * alphaMult );

		color.a = luA.a;
	}

	if ( alphaTestFunc > 0 ) {
		if ( color.a < alphaThreshold && alphaTestFunc != 1 && alphaTestFunc != 3 && alphaTestFunc != 5 )
			discard;
		if ( color.a == alphaThreshold && alphaTestFunc != 2 && alphaTestFunc != 3 && alphaTestFunc != 6 )
			discard;
		if ( color.a > alphaThreshold && ( alphaTestFunc < 4 || alphaTestFunc > 6 ) )
			discard;
	}

	fragColor = vec4( color.rgb * ( glowMult * sqrt(brightnessScale) ), color.a );
}
