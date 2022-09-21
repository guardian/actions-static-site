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

## Inputs

### **stack** `string` (required):

A Riffraff stack. This determines which AWS account your static site will be
deployed into.

### **domain** `string` (required):

The domain should be a Guardian-owned domain. For internal tools,
`[app].gutools.co.uk` is recommended.

### **auth** `'google' | 'none'` (optional - default='google'):

The auth mechanism to use for access.

'none' means that your application will be completely public. It is therefore
not a good choice for most applications.

If 'google' is selected access users will need to authenticate with a Guardian
(Google) email address in order to access the site.

You will therefore need to create a new Google Cloud project and generate Oauth
credentials for it. For more info, see
[here](https://developers.google.com/identity/protocols/oauth2/openid-connect#getcredentials).

Once the Google Cloud project is created and Oauth credentials generate you will
need to do the following:

1. Add the Google Client ID in Parameter Store

`/PROD/:stack/:app/googleClientID`

E.g. '/PROD/deploy/the-coolest-static-site/googleClientID'.

2. Add the Google Client Secret in Secret Manager

`/PROD/:stack/:app/googleClientSecret`

E.g. '/PROD/deploy/the-coolest-static-site/googleClientSecret'.

In both cases `:app` and `:stack` should match the inputs you use when
configuring the action in your workflow file.

### **artifact** `string` (optional - default='artifact')

Name of the artifact containing the static resources. Should be uploaded in
an earlier workflow step.
