import * as core from "@actions/core";
import { Template } from "aws-cdk-lib/assertions";
import { App } from "aws-cdk-lib";
import { StaticSite } from "./cdk/stack";
import * as fs from "fs";

export const main = async (): Promise<void> => {
  const app = core.getInput("app", { required: true });
  const domain = core.getInput("domain", { required: true });
  const stack = "deploy";
  core.info(JSON.stringify({ app, stack, domain }));

  const cdkApp = new App();
  const cdkStack = new StaticSite(cdkApp, "static-site", {
    app,
    stack,
    stage: "PROD",
    domainName: domain,
  });

  const cfn = Template.fromStack(cdkStack).toJSON();
  fs.writeFileSync("cfn.json", JSON.stringify(cfn, undefined, 2));
};

try {
  // execute only if invoked as main script (rather than test)
  if (require.main === module) main();
} catch (e) {
  const error = e as Error;
  core.error(error);
  core.setFailed(error.message);
}
