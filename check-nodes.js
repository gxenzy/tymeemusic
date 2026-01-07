// Quick diagnostic to check Lavalink/NodeLink nodes
import { config } from './src/config/config.js';

console.log('=== Node Configuration ===');
console.log(`Total nodes configured: ${config.nodes.length}`);
config.nodes.forEach((node, index) => {
    console.log(`\nNode ${index + 1}:`);
    console.log(`  ID: ${node.id}`);
    console.log(`  Host: ${node.host}`);
    console.log(`  Port: ${node.port}`);
    console.log(`  Secure: ${node.secure}`);
});

console.log('\n=== Environment Variables ===');
console.log(`NODELINK_ENABLED: ${process.env.NODELINK_ENABLED}`);
console.log(`NODELINK_HOST: ${process.env.NODELINK_HOST}`);
console.log(`NODELINK_PORT: ${process.env.NODELINK_PORT}`);
