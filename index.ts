import * as core from "@actions/core";
import * as artifact from "@actions/artifact";
import { Template } from "aws-cdk-lib/assertions";
import { App } from "aws-cdk-lib";
import { StaticSite } from "./cdk/stack";
import * as fs from "fs";

export const main = async (): Promise<void> => {
  console.log(process.env);

  const app = core.getInput("app", { required: true });
  const stack = core.getInput("stack", { required: true });
  const domain = core.getInput("domain", { required: true });
  core.info(JSON.stringify({ app, stack, domain }));

  const artifactName = core.getInput("artifact") || "artifact"; // TODO check if default is passed or must be set.
  const artifactClient = artifact.create();
  const sitePath = await artifactClient.downloadArtifact(artifactName); // TODO better error handling
  core.info(JSON.stringify({ sitePath }));

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
