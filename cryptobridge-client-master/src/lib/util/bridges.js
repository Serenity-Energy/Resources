// Formatted calls to the bridge contracts
const leftPad = require('left-pad');
const ethutil = require('ethereumjs-util');

// Get the block corresponding to the last block header Merkle root committed
// to the chain. queryAddr is the address of the bridge contract on the chain
// being queried and bridgedAddr is the address of the bridge on the other chain.
exports.getLastBlock = function(queryAddr, bridgedAddr, client, cb) {
  const data = `${LAST_BLOCK_ABI}${leftPad(bridgedAddr.slice(2), 64, '0')}`;
  client.eth.call({ to: queryAddr, data: data }, (err, ret) => {
    if (err) { cb(err); }
    else { cb(null, parseInt(ret, 16)); }
  })
}

// Get the current proposer for the chain being queried
exports.getProposer = function(queryAddr, client, cb) {
  const data = GET_PROPOSER_ABI;
  client.eth.call({ to: queryAddr, data: data }, (err, res) => {
    if (err) { cb(err); }
    else { cb(null, `0x${res.slice(26)}`); }
  })
}

// Get the validator threshold for a bridge
function getThreshold(bridge, client, cb) {
  const data = GET_THRESHOLD_ABI;
  client.eth.call({ to: bridge, data: data }, (err, res) => {
    if (err) { cb(err); }
    else { cb(null, parseInt(res)); }
  })
}
exports.getThreshold = getThreshold;

exports.propose = function(sigs, bridge, mappedChain, wallet, client, cb, gasPrice=1000000000) {
  const from = wallet.getAddress();
  let sigData = '0x';
  Object.keys(sigs).forEach((i) => {
    sigData += `${leftPad(sigs[i].sig.r, 64, '0')}${leftPad(sigs[i].sig.s, 64, '0')}${leftPad(sigs[i].sig.v.toString(16), 64, '0')}`;
  })
  // Ensure there are enough signatures from stakers to meet the threshold
  _checkSigsContract(sigs[0].root, mappedChain, sigs[0].start, sigs[0].end,
  sigData, bridge, client, (err, success) => {
    if (err) { cb(err); }
    else {
      // Get the nonce, form the transaction, and propose the root.
      client.eth.getTransactionCount(from, (err, nonce) => {
        const data = client.eth.abi.encodeFunctionCall({
          name: 'proposeRoot',
          type: 'function',
          inputs: [
            { type: 'bytes32', name: 'headerRoot'},
            { type: 'address', name: 'chainId' },
            { type: 'uint256', name: 'end' },
            { type: 'bytes', name: 'sigs' }
          ]},
          [ sigs[0].root, mappedChain, sigs[0].end, sigData ]
        )
        const tx = {
          to: bridge,
          from: wallet.getAddress(),
          data: data,
          gasPrice: gasPrice,
          gas: 500000,
          nonce: nonce,
        };
        const signedTx = wallet.signTx(tx);
        // Send the proposal tx!
        client.eth.sendSignedTransaction(signedTx, (err, h) => {
          if (err) { cb(err); }
          else { cb(null, h) };
        })
      })
    }
  })
}


// Check if a signature was made by a validator
exports.checkSig = function(h, sig, bridge, client, cb) {
  const msg = Buffer.from(h.slice(2), 'hex');
  const r = Buffer.from(sig.r, 'hex');
  const s = Buffer.from(sig.s, 'hex');
  const v = parseInt(sig.v);
  const signerPub = ethutil.ecrecover(msg, v, r, s);
  const signer = ethutil.pubToAddress(signerPub);
  // getStake(address)
  const data = `0x7a766460${leftPad(signer.toString('hex').slice(2), 64, '0')}`
  client.eth.call({ to: bridge, data: data }, (err, stake) => {
    if (err) { cb(err); }
    else if (parseInt(stake) == 0) { cb(null, null); }
    else { cb(null, `0x${signer.toString('hex')}`); }
  })
}

// Determine if the signatures map to at least `threshold` stakers. If they don't,
// a proposal with this signature data will fail.
function _checkSigsContract(hRoot, chain, start, end, sigData, bridge, client, cb) {
  let call = client.eth.abi.encodeFunctionCall({
    name: 'checkSignatures',
    type: 'function',
    inputs: [
      { type: 'bytes32', name: 'root'},
      { type: 'address', name: 'chain' },
      { type: 'uint256', name: 'start' },
      { type: 'uint256', name: 'end' },
      { type: 'bytes', name: 'sigs' }
    ]},
    [ hRoot, chain, start, end, sigData ]
  )
  client.eth.call({ to: bridge, data: call }, (err, nSigs) => {
    if (err) { cb(err); }
    else {
      getThreshold(bridge, client, (err, thresh) => {
        if (err) { cb(err); }
        else if (parseInt(nSigs) >= parseInt(thresh)) { cb(null, true); }
        else { cb(`Not enough staker signatures. Got ${parseInt(nSigs)}. Needed ${parseInt(thres)}.}`); }
      })
    }
  })
}

// Check if a receipt has at least a desired number of logs
function checkReceiptLogs(desired, hash, client, cb) {
  client.eth.getTransactionReceipt(hash, (err, receipt) => {
    if (err) { cb(err); }
    else if (receipt.logs.length < desired) { cb(null, false); }
    else { cb(null, true); }
  })
}
exports.checkReceiptLogs = checkReceiptLogs;


// getLastBlock(address)
const LAST_BLOCK_ABI = '0x4929dfa1';
// getProposer()
const GET_PROPOSER_ABI = '0xe9790d02';
// validatorThreshold()
const GET_THRESHOLD_ABI = '0x4fd101d7';
