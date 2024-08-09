const k8s = require('@kubernetes/client-node');

async function initKubeClient() {
    
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();

    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    try {
        await k8sApi.listNamespacedPod('default').then(async (res) => {
            for (const pod of res.body.items) {
                const name = pod.metadata?.name ||"";
                console.log(name);
                if(name.includes("cairohttp"))
                    console.log("hey")
                    //console.log(await fetch(`http://${name}:3000/health`))
            }
        });
    } catch (e) {
        console.log(e.body)
        console.log(e.statusCode)
        console.log(e.response)
        console.log(e)
    }
}

initKubeClient()