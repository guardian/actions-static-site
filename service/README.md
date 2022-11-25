# Proxy Go EC2 Service

This Go service does a couple of things:

* check Google Auth tokens
* serve requests via S3, but first re-writing the path to include the host

E.g.

    GET example.gutools.co.uk/main.css
    => /:static-site-bucket/example.gutools.co.uk/main.css

(`:static-site-bucket` is a placeholder for the actual bucket name.)

Run the tests with:

  $ go test ./...

