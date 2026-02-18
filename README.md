# Zoom RTMS - AWS Listener Worker

A lightweight Node.js worker designed to run on ephemeral AWS EC2 instances. It connects to Zoom's Real-Time Meeting Stream (RTMS) via WebSocket, performs the handshake, and forwards transcript data to an OutSystems ODC endpoint.

## 🚀 Architecture

This worker is typically launched by an **OutSystems ODC** application using the `ZoomLauncher` library.

1.  **Launch:** EC2 Instance boots up.
2.  **Inject:** User Data script runs `node worker.js` with arguments.
3.  **Connect:** Worker performs handshake with Zoom (Protocol v1).
4.  **Stream:** Worker listens for `Type 17` (Transcript) messages.
5.  **Forward:** Data is POSTed to the ODC Callback URL.
6.  **Cleanup:** On meeting end, the instance terminates itself.

## 🛠️ Prerequisites

* Node.js 18+
* `ws` library (`npm install ws`)
* An OutSystems ODC environment to receive the data.

## ⚙️ Usage (Manual / Testing)

You can run this locally to test the connection if you have valid Zoom credentials.

```bash
node worker.js \
  "<MeetingID>" \
  "<StreamID>" \
  "<SignalingURL>" \
  "<ClientID>" \
  "<ClientSecret>" \
  "<ODC_ApiKey>" \
  "<ODC_CallbackURL>"```

## 📦 Deployment (AMI Creation)
To build the "Golden Image" for AWS:

Launch an Amazon Linux 2023 instance.

Install Node.js:

```bash
sudo yum install -y nodejs```

Clone this repo:

```bash
git clone [https://github.com/](https://github.com/)<YOUR_USERNAME>/ZoomAWSListener.git
cd ZoomAWSListener
npm install```

Important: Ensure the startup script (User Data) in your ODC Launcher points to the correct path (e.g., /home/ec2-user/ZoomAWSListener/worker.js).

## 📄 License
MIT