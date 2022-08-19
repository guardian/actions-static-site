# Proxy Go lambda

This responds to ALB/API Gateway proxied requests and serves resources under
`/opt`, which is where Lambda layers are loaded.

The expectation is that the static site is loaded as a layer.

To rebuild the binary run:

    $ GOOS=linux GOARCH=amd64 go build main.go
    $ zip lambda.zip main
