#version 410 core

layout ( points ) in;
layout ( triangle_strip, max_vertices = 4 ) out;

#include "uniforms.glsl"

uniform vec2 particleScale;

in vec4 vsColor[];
in float vsParticleSize[];

out vec2 texCoords[9];

flat out vec4 A;
out vec4 C;
flat out vec4 D;

out vec3 N;

void main()
{
	A = vec4( sqrt(lightSourceAmbient.rgb) * 0.375, toneMapScale );
	C = vsColor[0];
	D = sqrt( vec4(lightSourceDiffuse[0].rgb, brightnessScale) );

	N = vec3( 0.0, 0.0, 1.0 );

	float	sx = vsParticleSize[0] * particleScale.x;
	float	sy = vsParticleSize[0] * particleScale.y;

	for ( int i = 0; i < 9; i++ )
		texCoords[i] = vec2( 1.0, 1.0 );
	gl_Position = projectionMatrix * ( gl_in[0].gl_Position + vec4( sx, sy, 0.0, 0.0 ) );
	EmitVertex();
	for ( int i = 0; i < 9; i++ )
		texCoords[i] = vec2( 0.0, 1.0 );
	gl_Position = projectionMatrix * ( gl_in[0].gl_Position + vec4( -sx, sy, 0.0, 0.0 ) );
	EmitVertex();
	for ( int i = 0; i < 9; i++ )
		texCoords[i] = vec2( 1.0, 0.0 );
	gl_Position = projectionMatrix * ( gl_in[0].gl_Position + vec4( sx, -sy, 0.0, 0.0 ) );
	EmitVertex();
	for ( int i = 0; i < 9; i++ )
		texCoords[i] = vec2( 0.0, 0.0 );
	gl_Position = projectionMatrix * ( gl_in[0].gl_Position + vec4( -sx, -sy, 0.0, 0.0 ) );
	EmitVertex();

	EndPrimitive();
}
