// Package web exposes the built Vite UI as an embedded filesystem so the whole
// product ships as one binary (no asset directory to deploy). Run `make ui`
// (vite build → web/dist) before `go build`; the placeholder keeps it compiling
// before the first UI build.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// FS returns the dist subtree rooted so "/" serves index.html.
func FS() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // dist is embedded at build time; this is unreachable
	}
	return sub
}
