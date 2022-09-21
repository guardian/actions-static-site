import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { StaticSite } from "./static-site";

describe("static site", () => {
  it("should match snapshot", () => {
    const cdkApp = new App();
    const cdkStack = new StaticSite(cdkApp, "static-site", {
      app: 'app',
      stack: 'stack',
      stage: "PROD",
      domainName: "example.devx.gutools.co.uk",
      layerVersionName: "layer",
      auth: true,
    });

    const got = Template.fromStack(cdkStack).toJSON();
    expect(got).toMatchSnapshot()
  })
})
