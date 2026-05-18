# Event Stream Pipeline

## Prerequisites

1. **AWS Account** - Sign up at [aws.amazon.com](https://aws.amazon.com)
2. **Node.js 22.x** - Download from [nodejs.org](https://nodejs.org)
3. **AWS SAM CLI** - Install from [aws.amazon.com/serverless/sam/](https://aws.amazon.com/serverless/sam/)
4. **AWS CLI** - Download from [aws.amazon.com/cli/](https://aws.amazon.com/cli/)

## How to Run

### Step 1: Configure AWS

```bash
aws configure
```

Enter your:
- AWS Access Key ID
- AWS Secret Access Key
- Default region: `us-east-1`
- Default output format: `json`

### Step 2: Download and Extract

1. Download the ZIP file from the repository
2. Extract it to your desired location
3. Open PowerShell and navigate to the extracted folder:

```bash
cd path/to/ecomm-folder
```

### Step 3: Deploy

```bash
./deploy-all.ps1
```

Wait for deployment to complete.

### Step 4: Access Your App

AWS will output your CloudFront URLs. Copy and paste them in your browser.

Done! 

---

## If You Used Git Clone Instead

If you cloned the repository using git instead of downloading the ZIP, run this before deploying:

```bash
npm install
```

Then proceed with Step 3 (deploy).
