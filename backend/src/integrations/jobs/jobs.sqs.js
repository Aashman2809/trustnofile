import { ChangeMessageVisibilityCommand, DeleteMessageCommand, GetQueueAttributesCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { config } from '../../config/env.js';

export function createSqsJobQueue({ queueUrl = config.analysisQueueUrl, region = config.awsRegion, client = null } = {}) {
  if (!queueUrl || !region) throw new Error('SQS queue requires ANALYSIS_QUEUE_URL and AWS_REGION.');
  const sqs = client || new SQSClient({ region });
  return {
    async enqueue(payload, localProcess) {
      if (typeof payload === 'function') { await payload(); return; }
      if (typeof payload?.analysisId !== 'string' || typeof payload?.fileId !== 'string') throw new Error('Invalid analysis job payload.');
      await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify({ version: 1, analysisId: payload.analysisId, fileId: payload.fileId }) }));
      void localProcess;
    },
    async receive({ waitSeconds = 20, visibilityTimeout = 900 } = {}) {
      const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: waitSeconds, VisibilityTimeout: visibilityTimeout }));
      return Messages.map((message) => ({ receiptHandle: message.ReceiptHandle, body: message.Body }));
    },
    async acknowledge(receiptHandle) { if (receiptHandle) await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle })); },
    async extendVisibility(receiptHandle, visibilityTimeout = 900) { if (receiptHandle) await sqs.send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle, VisibilityTimeout: visibilityTimeout })); },
    async getStatus() {
      try { await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] })); return { status: 'available', provider: 'sqs' }; }
      catch { return { status: 'unavailable', provider: 'sqs', reason: 'queue_unavailable' }; }
    },
  };
}
