
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { gzipSync } = require("zlib");
const k8s = require("@kubernetes/client-node");

const kc = new k8s.KubeConfig();
kc.loadFromFile("./cronjob-kubeconfig.yaml");
const k8sApi = kc.makeApiClient(k8s.AppsV1Api);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);
const namespace = "database"; 
// Define the namespace where the logs will be retrieved from

const statefulSetName = "postgres"; 

const compressedLogFilename = `${statefulSetName}-logs-` \
+ new Date().toISOString() + ".gz";
const s3 = new S3Client({
    region: "YOUR_REGION", 
    credentials: {
      accessKeyId: 'ACCESS_KEY_ID',
      secretAccessKey: 'SECRET_ACCESS_KEY_ID',
    },
  });
  
  const bucketName = "postgres-database-logs"; 
  async function retrieveLogs() {
  
    const statefulSet = await k8sApi.readNamespacedStatefulSet\
    (statefulSetName, namespace);
    const podLabels = statefulSet.body.spec.selector.matchLabels;
  
  
    const pods = await coreApi.listNamespacedPod(namespace, undefined, \
     undefined, undefined, undefined, Object.keys(podLabels).map \
     (key => `${key}=${podLabels[key]}`).join(','));
  
   
    for (const pod of pods.body.items) {
      const logsResponse = await coreApi.readNamespacedPodLog \
      (pod.metadata.name, namespace);
      const compressedLogs = gzipSync(logsResponse.body);
      const uploadParams = {
        Bucket: bucketName,
        Key: `${pod.metadata.name}-${compressedLogFilename}`,
        Body: compressedLogs,
      };
      const uploadCommand = new PutObjectCommand(uploadParams);
      await s3.send(uploadCommand);
      console.log(`Logs for pod ${pod.metadata.name} uploaded to S3 \
      bucket ${bucketName} as ${pod.metadata.name}-${compressedLogFilename}`);
    }
  }
  retrieveLogs().catch((err) => console.error(err));