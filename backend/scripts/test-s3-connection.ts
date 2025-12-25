import 'dotenv/config';
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { readAttachmentsStorageConfig } from '../src/attachments/storage/attachments-storage.config';

async function main() {
  console.log('Reading configuration...');
  const cfg = readAttachmentsStorageConfig();

  if (!cfg.s3) {
    console.error('Error: S3 configuration is missing in .env');
    console.error(
      'Please set ATTACHMENTS_STORAGE_DRIVER=s3 and all S3_* variables.',
    );
    process.exit(1);
  }

  const s3Config = cfg.s3;

  console.log('Configuration found:');
  console.log(`  Endpoint: ${s3Config.endpoint}`);
  console.log(`  Region: ${s3Config.region}`);
  console.log(`  Bucket: ${s3Config.bucket}`);
  console.log(`  AccessKeyId: ${s3Config.accessKeyId ? '***' : 'MISSING'}`);
  console.log(
    `  SecretAccessKey: ${s3Config.secretAccessKey ? '***' : 'MISSING'}`,
  );
  console.log(`  ForcePathStyle: ${s3Config.forcePathStyle}`);

  const client = new S3Client({
    region: s3Config.region,
    endpoint: s3Config.endpoint,
    forcePathStyle: s3Config.forcePathStyle,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey,
    },
  });

  const testKey = `${s3Config.keyPrefix}connectivity-test-${Date.now()}.txt`;

  try {
    console.log('\n1. Testing Bucket Access (HeadBucket)...');
    await client.send(new HeadBucketCommand({ Bucket: s3Config.bucket }));
    console.log('   ✅ Success: Bucket exists and is accessible.');
  } catch (err: any) {
    console.error('   ❌ Failed:', err.name, err.$metadata?.httpStatusCode);
    if (err.$metadata?.httpStatusCode === 403) {
      console.error(
        '      Hint: Check if your credentials have s3:ListBucket or s3:GetBucketLocation permissions, or if the bucket name is correct.',
      );
    }
  }

  try {
    console.log(`\n2. Testing Write Access (PutObject: ${testKey})...`);
    await client.send(
      new PutObjectCommand({
        Bucket: s3Config.bucket,
        Key: testKey,
        Body: 'Hello S3',
      }),
    );
    console.log('   ✅ Success: File uploaded.');
  } catch (err: any) {
    console.error('   ❌ Failed:', err.name, err.$metadata?.httpStatusCode);
    console.error(err);
    return; // Stop if we can't write
  }

  try {
    console.log(`\n3. Testing Read Access (HeadObject: ${testKey})...`);
    await client.send(
      new HeadObjectCommand({
        Bucket: s3Config.bucket,
        Key: testKey,
      }),
    );
    console.log('   ✅ Success: File metadata read.');
  } catch (err: any) {
    console.error('   ❌ Failed:', err.name, err.$metadata?.httpStatusCode);
    if (err.$metadata?.httpStatusCode === 403) {
      console.error(
        '      Hint: You might have Write permission but not Read permission (s3:GetObject).',
      );
    }
  }

  try {
    console.log(`\n4. Testing Delete Access (DeleteObject: ${testKey})...`);
    await client.send(
      new DeleteObjectCommand({
        Bucket: s3Config.bucket,
        Key: testKey,
      }),
    );
    console.log('   ✅ Success: File deleted.');
  } catch (err: any) {
    console.error('   ❌ Failed:', err.name, err.$metadata?.httpStatusCode);
  }

  console.log('\nDiagnostic complete.');
}

main().catch(console.error);
