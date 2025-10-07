<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Reference Documentation

Quick reference guides for SYNDI system administration.

```{toctree}
:maxdepth: 2
:hidden:

makefile-commands
```

## Reference Guides

### Makefile Commands
**TBD** - Complete Makefile command reference

Topics to cover:
- All make commands with descriptions
- Required and optional parameters
- Examples for each command
- Common command combinations

### AWS Resources
**TBD** - AWS resource naming conventions

Topics to cover:
- Resource naming patterns
- Stack naming
- Bucket naming
- Lambda function naming
- API Gateway naming
- Cognito naming

### Environment Variables
**TBD** - Environment variable reference

Topics to cover:
- Lambda environment variables
- Frontend environment variables
- Build-time variables
- Runtime variables

## Quick Reference

### Common Make Commands

**Setup:**
- `make setup-local ENV=dev ORG=myorg` - Setup local environment
- `make config ENV=dev ORG=myorg` - Deploy configuration

**Development:**
- `make start-dev ENV=dev ORG=myorg` - Start both servers
- `make stop-all` - Stop all servers

**Testing:**
- `make test-all` - Run all tests
- `make test-frontend` - Frontend tests
- `make test-backend` - Backend tests
- `make test-e2e` - E2E tests

**Building:**
- `make build-frontend ENV=dev ORG=myorg` - Build frontend (clean)
- `make build-backend ENV=dev ORG=myorg` - Build backend (clean)

**AWS Deployment:**
- `make rs-deploy ENV=stage ORG=myorg` - Full deploy
- `make rs-deploy-only ENV=stage ORG=myorg` - Deploy without build
- `make rs-deploy-function ENV=stage ORG=myorg` - Quick Lambda update

**Monitoring:**
- `make check-rs ENV=stage ORG=myorg` - Check deployment
- `make rs-watch-log ENV=stage ORG=myorg` - View logs
- `make sync-configs ENV=stage ORG=myorg` - Sync configs

## Resource Naming Patterns

### CloudFormation Stack
```
rawscribe-{env}-{org}
Example: rawscribe-stage-myorg
```

### Lambda Function
```
rawscribe-{env}-{org}-backend
Example: rawscribe-stage-myorg-backend
```

### API Gateway
```
rawscribe-{env}-{org}-api
Example: rawscribe-stage-myorg-api
```

### S3 Buckets
```
rawscribe-{service}-{env}-{org}-{accountid}
Examples:
  rawscribe-lambda-stage-myorg-288761742376
  rawscribe-forms-stage-myorg-288761742376
  rawscribe-eln-stage-myorg-288761742376
  rawscribe-eln-drafts-stage-myorg-288761742376
  syndi-frontend-stage-myorg-288761742376
```

### Cognito User Pool
```
rawscribe-{env}-{org}-userpool
Example: rawscribe-stage-myorg-userpool
```

## Related Documentation

- [Makefile Deployment](../deployment/makefile-deployment.md)
- [Configuration System](../architecture/configuration-system.md)
- [Multi-Organization Setup](../deployment/multi-organization.md)
