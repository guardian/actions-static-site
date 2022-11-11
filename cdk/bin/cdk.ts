import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { Infra } from '../infra';

const app = new App();

new Infra(app, 'Static-Site-INFRA', {
	app: "actions-static-site-infra",
  stack: 'deploy',
	stage: 'INFRA',
	env: { region: 'eu-west-1' },
	domainName: 'static-site.gutools.co.uk',
});
