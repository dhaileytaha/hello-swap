/// Orchestrate the hello swap apps

// Start 2 instances of helloSwap
// "Link" them together. eg extract PeerId etc.
// Call "sendSwap()" on one instance which is going to trigger a swap query

import { HelloSwap } from "./helloSwap";

async function startMaker() {
  const maker = new HelloSwap("http://localhost:8000/");
  console.log("Maker started:", await maker.cndPeerId());
}

startMaker();
