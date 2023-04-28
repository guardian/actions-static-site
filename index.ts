import * as fs from "fs";
import * as core from "@actions/core";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { StaticSite } from "./cdk/static-site";
import {validCodeDomainSuffixes} from "./validCodeDomainSuffixes";

export const main = (): void => {
  const app = core.getInput("APP", { required: true });
  const domain = core.getInput("DOMAIN", { required: true });
  const codeDomain = core.getInput("CODE_DOMAIN", { required: false });

  const stack = "deploy";

  core.info(
    "Inputs are: " +
      JSON.stringify({ app, stack, domain, codeDomain })
  );

  if(codeDomain && !validCodeDomainSuffixes.some(validCodeDomainSuffix => codeDomain.endsWith(validCodeDomainSuffix))) {
    throw new Error(
      `${codeDomain} does not end in any of: ${validCodeDomainSuffixes.toString()}.
      To add more, raise a PR in https://github.com/guardian/actions-static-site,
      edit validCodeDomainSuffixes.ts, run 'npm run build' and commit the resulting JS.`
    );
  }

  const cdkApp = new App();
  const cdkStack = new StaticSite(cdkApp, "static-site", {
    app,
    stack,
    stage: "PROD",
    domainName: domain,
  });

  const cfn = Template.fromStack(cdkStack).toJSON();
  fs.writeFileSync("cfn.json", JSON.stringify(cfn, undefined, 2));

  if (codeDomain) {
    const cdkAppCODE = new App();
    const cdkStackCODE = new StaticSite(cdkAppCODE, "static-site-code", {
      app,
      stack,
      stage: "CODE",
      domainName: codeDomain,
    });

    const cfnCODE = Template.fromStack(cdkStackCODE).toJSON();
    fs.writeFileSync("cfn-CODE.json", JSON.stringify(cfnCODE, undefined, 2));
  }
};

try {
  // execute only if invoked as main script (rather than test)
  if (require.main === module) main()
} catch (e) {
  const error = e as Error;
  core.error(error);
  core.setFailed(error.message);
}
