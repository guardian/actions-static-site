import { GuDistributionBucketParameter, GuStack, GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { App, Duration } from "aws-cdk-lib";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { GuVpc, SubnetType } from "@guardian/cdk/lib/constructs/ec2";
import { GuCname } from "@guardian/cdk/lib/constructs/dns/";
import { GuCertificate } from "@guardian/cdk/lib/constructs/acm";
import { Code, Function, LayerVersion, Runtime } from "aws-cdk-lib/aws-lambda";
import { LambdaTarget } from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";

interface StaticSiteProps extends GuStackProps {
  app: string;
  domainName: string;
}

// It is surprisingly tricky in AWS to setup a static site, with a custom domain
// and Google authentication. The solution chosen here is as follows:
//
// ALB -> Lambda
//
// where Google authentication is performed at the ALB level, and the site is
// served from the Lambda as a layer.
//
// Users of this action should NOT assume that this architecture won't change
// going forward though.
export class StaticSite extends GuStack {
  constructor(scope: App, id: string, props: StaticSiteProps) {
    super(scope, id, props);

    const bucket = Bucket.fromBucketName(
      this,
      `${id}-bucket`,
      GuDistributionBucketParameter.getInstance(this).valueAsString
    );

    const keyPrefix = `${this.stack}/${this.stage}/${props.app}`;

    const siteLayer = new LayerVersion(this, "site-layer", {
      code: Code.fromBucket(bucket, `${keyPrefix}/site.zip`),
      description: "layer for static site",
    });

    const lambda = new Function(this, "lambda", {
      runtime: Runtime.GO_1_X,
      handler: "main",
      code: Code.fromBucket(bucket, `${keyPrefix}/lambda.zip`),
      layers: [siteLayer],
    });

    const vpc = GuVpc.fromIdParameter(this, "vpc-id");
    const publicSubnets = GuVpc.subnetsFromParameter(this, { type: SubnetType.PUBLIC, app: props.app });


    const alb = new ApplicationLoadBalancer(this, "alb", {
      vpc: vpc,
      vpcSubnets: { subnets: publicSubnets },
      internetFacing: true,
    });

    new GuCname(this, "cname", {
      app: props.app,
      domainName: props.domainName,
      ttl: Duration.minutes(1),
      resourceRecord: alb.loadBalancerDnsName,
    });

    const cert = new GuCertificate(this, {
      app: props.app,
      domainName: props.domainName,
    });

    const listener = alb.addListener("listener", {
      protocol: ApplicationProtocol.HTTPS,
      port: 443,
      certificates: [cert],
    });

    // ListenerAction.authenticateOidc; TODO once I have Google powers.

    const targets = listener.addTargets("target", { targets: [new LambdaTarget(lambda)] });
    targets.setAttribute("lambda.multi_value_headers.enabled", "true"); // See: https://github.com/akrylysov/algnhsa/pull/20/files#diff-b335630551682c19a781afebcf4d07bf978fb1f8ac04c6bf87428ed5106870f5R81.
  }
}
