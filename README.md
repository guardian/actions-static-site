# @guardian/actions-static-site

Github Action for a Guardian static site. The action takes static files (which
you generate in an earlier workflow step) and creates a Riffraff deployment for
your static site. Access is (optionally) controlled via Google Auth.

To use this action, you must upload your static site as a Github Actions
artifact in an earlier workflow step.

Example usage:

```
# First upload your site as an artifact e.g. with:
- uses: actions/upload-artifact@v3
  with:
    path: path/to/site-dir

# Then call this action:
- uses: guardian/actions-static-site@v1
  with:
    app: string
    stack: string
    domain: string
```

(There are some additional optional arguments too - see below for details.)

## TODOs

- [x] get synth working
- [x] get riff-raff bundle working
- [ ] ensure works cross-account (dist buckets are currently hardcoded in rr config)
- [ ] get google creds for \*.devx.gutools.co.uk and update inputs accordingly

## Inputs

#### **stack** `string` (required):

A Riffraff stack. This determines which AWS account your static site will be
deployed into.

#### **domain** `string` (required):

The domain should be a Guardian-owned domain. For internal tools,
`[app].gutools.co.uk` is recommended.

#### **auth** `'google' | 'none'` (optional - default='google'):

The auth mechanism to use for access. If 'google' is selected access users will
need to authenticate with a Guardian (Google) email address in order to access
the site.

To make this work you will also need to set up the following SSM parameters in
your target account:

    /:STAGE/:stack/:app/googleClientID
    /:STAGE/:stack/:app/googleClientSecret

For example:

    /PROD/deploy/the-coolest-static-site/googleClientID
    /PROD/deploy/the-coolest-static-site/googleClientSecret

**Ensure the secret is a _secure_ SSM Parameter.**

To get sensible values for these, you will need to create a new Google Cloud
project and generate Oauth credentials for it. For more info, see
[here](https://developers.google.com/identity/protocols/oauth2/openid-connect#getcredentials).

#### **artifact** `string` (optional - default='artifact')

Name of the artifact containing the static resources. Should be uploaded in
an earlier workflow step.
