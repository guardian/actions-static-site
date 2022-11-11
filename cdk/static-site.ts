import { GuCertificate } from "@guardian/cdk/lib/constructs/acm";
import type {
  GuStackProps} from "@guardian/cdk/lib/constructs/core";
import {
  GuStack,
  GuStringParameter,
} from "@guardian/cdk/lib/constructs/core";
import { GuCname } from "@guardian/cdk/lib/constructs/dns/";
import type { App} from "aws-cdk-lib";
import { Duration } from "aws-cdk-lib";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  CfnListenerCertificate,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";

interface StaticSiteProps extends GuStackProps {
  app: string;
  domainName: string;
}

// See README.md for an explanation of the overall architecture.
export class StaticSite extends GuStack {
  constructor(scope: App, id: string, props: StaticSiteProps) {
    super(scope, id, props);

    const listenerArn = new GuStringParameter(this, "listenerArn", {
      description: "ARN of shared ALB listener for this action.",
      fromSSM: true,
      default: '/INFRA/deploy/actions-static-site-infra/listenerArn',
    })

    const albDnsName = new GuStringParameter(this, "loadBalancerDnsName", {
      description: "DNS name of shared ALB for this action.",
      fromSSM: true,
      default: "/INFRA/deploy/actions-static-site-infra/loadBalancerDnsName",
    })

    new GuCname(this, "cname", {
      app: props.app,
      domainName: props.domainName,
      ttl: Duration.days(1),
      resourceRecord: albDnsName.valueAsString,
    });

    const cert = new GuCertificate(this, {
      app: props.app,
      domainName: props.domainName,
    });

    new CfnListenerCertificate(this, "cert-listener", {
      listenerArn: listenerArn.valueAsString,
      certificates: [{ certificateArn: cert.certificateArn }],
    })
  }
}
