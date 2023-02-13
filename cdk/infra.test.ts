import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import {Infra} from "./infra";

describe("static site INFRA", () => {
  it("should match snapshot", () => {
    const cdkApp = new App();
    const cdkStack = new Infra(cdkApp, "static-site-INFRA", {
      app: 'app',
      stack: 'stack',
      stage: "INFRA",
      domainName: "example.devx.gutools.co.uk",
    });

    const got = Template.fromStack(cdkStack).toJSON();
    expect(got).toMatchSnapshot()
  })
})
