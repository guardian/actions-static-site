import * as core from "@actions/core";
import { Template } from "aws-cdk-lib/assertions";
import { App } from "aws-cdk-lib";
import { StaticSite } from "./cdk/static-site";
import { PutParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import * as fs from "fs";

export const main = async (): Promise<void> => {
  const app = core.getInput("app", { required: true });
  const domain = core.getInput("domain", { required: true });
  const auth = core.getInput("auth", { required: true });
  const googleClientId = core.getInput("googleClientId");
  const googleClientSecret = core.getInput("googleClientSecret");
  const stack = "deploy";

  core.info("Inputs are: " + JSON.stringify({ app, stack, domain, auth }));

  if (auth === "google") {
    if (googleClientId === "" || googleClientSecret === "") {
      core.setFailed(
        "The following inputs are required to be non-empty when auth='google': ['googleClientId', 'googleClientSecret']."
      );

      return;
    }

    // upload to Parameter Store
    const client = new SSMClient({ region: "eu-west-1" });

    const setClientId = new PutParameterCommand({
      Name: `/actions-static-site/${app}/googleClientId`,
      Value: googleClientId,
      Type: "String",
    });
    await client.send(setClientId);

    const setSecret = new PutParameterCommand({
      Name: `/actions-static-site/${app}/googleClientSecret`,
      Value: googleClientSecret,
      Type: "SecureString",
    });

    await client.send(setSecret);
  }

  const cdkApp = new App();
  const cdkStack = new StaticSite(cdkApp, "static-site", {
    app,
    stack,
    auth: auth === "google",
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
