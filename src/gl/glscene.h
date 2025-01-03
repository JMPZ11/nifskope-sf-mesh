/***** BEGIN LICENSE BLOCK *****

BSD License

Copyright (c) 2005-2015, NIF File Format Library and Tools
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:
1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.
3. The name of the NIF File Format Library and Tools project may not be
   used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

***** END LICENCE BLOCK *****/

#ifndef GLSCENE_H
#define GLSCENE_H

#include "glnode.h"
#include "glproperty.h"
#include "gltools.h"
#include "gltex.h"

#include <QFlags>
#include <QObject>
#include <QHash>
#include <QMap>
#include <QPersistentModelIndex>
#include <QStack>
#include <QStringList>


//! @file glscene.h Scene

class NifModel;
class Renderer;
class Shape;
class QAction;
class QOpenGLContext;

class Scene final : public QObject
{
	Q_OBJECT
public:
	Scene( TexCache * texcache, QObject * parent = nullptr );
	~Scene();

	void setOpenGLContext( QOpenGLContext * context );
	inline bool haveRenderer() const
	{
		return bool( renderer );
	}

	void updateShaders();

	void clear( bool flushTextures = true );
	void make( NifModel * nif, bool flushTextures = false );

	void update( const NifModel * nif, const QModelIndex & index );

	void transform( const Transform & trans, float time = 0.0 );

	void draw();
	void drawShapes();
	void drawGrid();
	void drawNodes();
	void drawHavok();
	void drawFurn();
	void drawSelection() const;

	void setSequence( const QString & seqname );

	QString textStats();

	Node * getNode( const NifModel * nif, const QModelIndex & iNode );
	Property * getProperty( const NifModel * nif, const QModelIndex & iProperty );
	Property * getProperty( const NifModel * nif, const QModelIndex & iParentBlock, const QString & itemName, const QString & mustInherit );

	const NifModel *	nifModel = nullptr;

	enum SceneOption
	{
		None = 0x0,
		ShowAxes = 0x1,
		ShowGrid = 0x2,
		ShowNodes = 0x4,
		ShowCollision = 0x8,
		ShowConstraints = 0x10,
		ShowMarkers = 0x20,
		DoDoubleSided = 0x40,
		DoVertexColors = 0x80,
		DoSpecular = 0x100,
		DoGlow = 0x200,
		DoTexturing = 0x400,
		DoBlending = 0x800,
		DoMultisampling = 0x1000,
		DoLighting = 0x2000,
		DoCubeMapping = 0x4000,
		DisableShaders = 0x8000,	// unsupported with core profile OpenGL
		ShowHidden = 0x10000,
		DoSkinning = 0x20000,
		DoErrorColor = 0x40000
	};
	Q_DECLARE_FLAGS( SceneOptions, SceneOption );

	SceneOptions options;
	inline bool hasOption(SceneOptions optValue) const { return ( options & optValue ); }

	inline int bindTexture( const QStringView & fname, bool forceTexturing = false )
	{
		if ( ( forceTexturing || hasOption(DoTexturing) ) && !fname.isEmpty() ) [[likely]]
			return textures->bind( fname, nifModel );
		return 0;
	}

	inline int bindTexture( const QModelIndex & iSource )
	{
		if ( hasOption(DoTexturing) && iSource.isValid() ) [[likely]]
			return textures->bind( iSource );
		return 0;
	}

	// flags & 1 = force texturing, flags & 2 = use second texture
	inline bool bindCube( const QString & fname, int flags = 0 )
	{
		if ( ( flags & 1 ) || hasOption(DoTexturing) ) [[likely]]
			return textures->bindCube( fname, nifModel, bool( flags & 2 ) );
		return false;
	}

	inline const TexCache::Tex::ImageInfo * getTextureInfo( const QStringView & fname ) const
	{
		return textures->getTextureInfo( fname );
	}

	enum VisModes
	{
		VisNone = 0x0,
		VisLightPos = 0x1,
		VisNormalsOnly = 0x2,
		VisSilhouette = 0x4
	};

	Q_DECLARE_FLAGS( VisMode, VisModes );

	VisMode visMode;
	inline bool hasVisMode(VisModes modeValue) const { return ( visMode & modeValue ); }

	enum SelModes
	{
		SelNone = 0,
		SelObject = 1,
		SelVertex = 2
	};

	Q_DECLARE_FLAGS( SelMode, SelModes );

	SelMode selMode;
	inline bool isSelModeObject() const { return ( selMode & SelObject ); }
	inline bool isSelModeVertex() const { return ( selMode & SelVertex ); }

	enum LodLevel
	{
		Level0 = 0,
		Level1 = 1,
		Level2 = 2,
		Level3 = 3
	};

	LodLevel lodLevel;


	Renderer * renderer = nullptr;

	NodeList nodes;
	PropertyList properties;

	NodeList roots;

	mutable QHash<int, Transform> worldTrans;
	mutable QHash<int, Transform> viewTrans;
	mutable QHash<int, Transform> bhkBodyTrans;

	Transform view;

	bool selecting;
	bool animate;

	float time;

	QString animGroup;
	QStringList animGroups;
	QMap<QString, QMap<QString, float> > animTags;

	TexCache * textures;

	QPersistentModelIndex currentBlock;
	QPersistentModelIndex currentIndex;

	QVector<Shape *> shapes;

	QColor gridColor;

	FloatVector4 currentGLColor;
	FloatVector4 currentGLLineParams;	// line width, stipple factor, stipple pattern, point size

	BoundSphere bounds() const;

	float timeMin() const;
	float timeMax() const;
signals:
	void sceneUpdated();
	void disableSave();

public slots:
	void updateSceneOptions( bool checked );
	void updateSceneOptionsGroup( QAction * );
	void updateSelectMode( QAction * );
	void updateLodLevel( int );

protected:
	mutable bool sceneBoundsValid, timeBoundsValid;
	mutable BoundSphere bndSphere;
	mutable float tMin = 0, tMax = 0;

	void updateTimeBounds() const;

public:
	//! gltools.cpp interface
	NifSkopeOpenGLContext::Program * useProgram( std::string_view name );
	void setGLColor( const QColor & c );
	inline void setGLColor( FloatVector4 c )
	{
		currentGLColor = c;
	}
	inline void setGLColor( float r, float g, float b, float a )
	{
		currentGLColor = FloatVector4( r, g, b, a );
	}
	inline void setGLLineParams( float lineWidth, float stippleFactor = 0.0f, int stipplePattern = 0 )
	{
		currentGLLineParams[0] = lineWidth;
		currentGLLineParams[1] = stippleFactor;
		currentGLLineParams[2] = stipplePattern;
	}
	inline void setGLPointSize( float pointSize )
	{
		currentGLLineParams[3] = pointSize;
	}
	// flags = 1: set matrix for selection.prog only
	// flags = 2: set matrix for lines.prog only
	void setModelViewMatrix( const Matrix4 & m, int flags = 0 );
	void setModelViewMatrix( const Transform & t, int flags = 0 );
	void setModelViewMatrix( const Transform & t1, const Transform & t2, int flags = 0 );
	void setModelViewMatrix( const Transform & t1, const Transform & t2, const Transform & t3, int flags = 0 );
	void drawPoint( const Vector3 & a );
	void drawLine( const Vector3 & a, const Vector3 & b );
	void drawLines( const float * positions, size_t numVerts, const float * colors = nullptr,
					unsigned int elementMode = GL_LINES );
	void drawLineStrip( const float * positions, size_t numVerts, const float * colors = nullptr );
	void drawAxes( const Vector3 & c, float axis, bool color = true );
	void drawAxesOverlay( const Transform & vt, const Vector3 & c, float axis, const Vector3 & axesDots );
	void drawGrid( float s, int lines, int sub, FloatVector4 color, FloatVector4 axis1Color, FloatVector4 axis2Color );
	void drawBox( const Vector3 & a, const Vector3 & b );
	void drawCircle( const Vector3 & c, const Vector3 & n, float r, int sd = 16 );
	void drawArc( const Vector3 & c, const Vector3 & x, const Vector3 & y, float an, float ax, int sd = 8 );
	void drawSolidArc( const Vector3 & c, const Vector3 & n, const Vector3 & x, const Vector3 & y,
						float an, float ax, float r, int sd = 8 );
	void drawCone( const Vector3 & c, Vector3 n, float a, int sd = 16 );
	void drawRagdollCone( const Vector3 & pivot, const Vector3 & twist, const Vector3 & plane,
							float coneAngle, float minPlaneAngle, float maxPlaneAngle, int sd = 16 );
	void drawSphereSimple( const Vector3 & c, float r, int sd = 36 );
	void drawSphere( const Vector3 & c, float r, int sd = 8 );
	void drawCapsule( const Vector3 & a, const Vector3 & b, float r, int sd = 5 );
	void drawCylinder( const Vector3 & a, const Vector3 & b, float r, int sd = 5 );
	void drawDashLine( const Vector3 & a, const Vector3 & b, int sd = 15 );
	void drawConvexHull( const NifModel * nif, const QModelIndex & iShape, float scale, bool solid = false );
	void drawNiTSS( const NifModel * nif, const QModelIndex & iShape, bool solid = false );
	void drawCMS( const NifModel * nif, const QModelIndex & iShape, bool solid = false );
	void drawSpring( const Vector3 & a, const Vector3 & b, float stiffness, int sd = 16, bool solid = false );
	void drawRail( const Vector3 & a, const Vector3 & b );

	// vec3 position, vec4 color, vec3 normal, vec3 tangent, vec3 bitangent, vec4 weights0, vec4 weights1,
	// vec2 texcoord0, ..., vec2 texcoord8
	static const float * const	defaultVertexAttrs[16];
	static constexpr std::uint64_t	defaultAttrMask = 0x2222222224433343ULL;
};

Q_DECLARE_OPERATORS_FOR_FLAGS( Scene::SceneOptions )

Q_DECLARE_OPERATORS_FOR_FLAGS( Scene::VisMode )

#endif
