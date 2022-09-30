# @guardian/actions-static-site

*Note, the current architecture means that page sizes (initial load) must be
less than 1mb. This is an AWS limitation with lambdas and ALBs. We're looking at
alternative architectures to improve this story.*

Github Action for a Guardian static site. The action takes static files (which
you generate in an earlier workflow step) and creates a Riffraff deployment for
your static site. Access is (optionally) controlled via Google Auth.

To use this action, you must upload your static site as a Github Actions
artifact in an earlier workflow step.

Example usage:

```
# First upload your site as an artifact:
- uses: actions/upload-artifact@v3
  with:
    path: path/to/site-dir

# Then call this action:
- uses: guardian/actions-static-site@v1
  with:
    app: 'example-app'
    domain: 'example-app.gutools.co.uk'
    auth: 'google'
    googleClientId: ${{ secrets.GOOGLE_CLIENT_ID }}
    googleClientSecret: ${{ secrets.GOOGLE_CLIENT_SECRET }}
```

If using Google auth (recommended) request credentials from DevX (`P&E/DevX
Stream).

*Note, if using Google auth the client ID and client secret must be passed as
Github Action secrets rather than inlined.*

The following secrets must also be available in your repository:

    GU_RIFF_RAFF_ROLE_ARN
    GU_ACTIONS_STATIC_SITE_ROLE_ARN

These are required for AWS API calls and should be automatically available to
your repository as [organisational
secrets](https://docs.github.com/en/actions/using-workflows/sharing-workflows-secrets-and-runners-with-your-organization#sharing-secrets-within-an-organization).

See Inputs below for further details.

## Inputs

### **stack** `string` (required):

A Riffraff stack. This determines which AWS account your static site will be
deployed into.

### **domain** `string` (required):

The domain should be a Guardian-owned domain. For internal tools,
`[app].gutools.co.uk` is recommended but check it is free first!

### **auth** `'google' | 'none'` (required):

The auth mechanism to use for access.

'none' means that your application will be completely public. It is therefore
*not* a good choice for most applications.

If 'google' is selected access users will need to authenticate with a Guardian
(Google) email address in order to access the site.

### **googleClientId** (required if auth='google')

See 'auth' for how to obtain this. You should pass this as a secret rather than
inlining into your workflow file directly.

### **googleSecretId** (required if auth='google')

See 'auth' for how to obtain this. You should pass this as a secret rather than
inlining into your workflow file directly.

### **artifact** `string` (optional - default='artifact')

Name of the artifact containing the static resources. Should be uploaded in
an earlier workflow step.
