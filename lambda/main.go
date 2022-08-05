package main

import (
	"net/http"

	"github.com/akrylysov/algnhsa"
)

func main() {
	fs := http.FileServer(http.Dir("/opt")) // lambda layers are installed here
	http.Handle("/", fs)

	// http.ListenAndServe("localhost:3030", nil)
	algnhsa.ListenAndServe(nil, nil)

}
