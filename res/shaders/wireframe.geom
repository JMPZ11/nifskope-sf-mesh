#version 410 core

layout ( triangles ) in;
layout ( triangle_strip, max_vertices = 18 ) out;

uniform mat4 projectionMatrix;

in vec4 vsColor[];
out vec4 C;

#include "drawline.glsl"

void main()
{
	C = vsColor[0];

	for ( int i = 0; i < 3; i++ ) {
		vec4	p0 = projectionMatrix * gl_in[i * 3].gl_Position;
		vec4	p1 = projectionMatrix * gl_in[i * 3 + 1].gl_Position;
		vec4	p2 = projectionMatrix * gl_in[i * 3 + 2].gl_Position;

		drawLine( p0, p1 );
		drawLine( p1, p2 );
		drawLine( p2, p0 );
	}
}
