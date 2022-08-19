package main

import (
	"net/http"

	"github.com/akrylysov/algnhsa"
)

func main() {
	fs := http.FileServer(http.Dir("/opt/site")) // (the site layer)
	http.Handle("/", fs)

	// http.ListenAndServe("localhost:3030", nil)
	algnhsa.ListenAndServe(nil, nil)
}
