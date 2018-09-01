// Connect to and handle networks
const fs = require('fs');
const Peer = require('./lib/Peer.js').Peer;
const jsonfile = require('jsonfile');

// Network indexes are formatted `networkA_networkB` where each network is
// represented by the address of the deployed bridge contract on the given
// blockchain.
exports.getNetIndex = function(networks) {
  const tmpA = networks[0];
  const tmpB = networks[1];
  if (tmpB > tmpA) { return `${tmpA}_${tmpB}`; }
  else { return `${tmpB}_${tmpA}`; }
}

exports.getFirstIndex = function(dir) {
  const fPath = `${dir}/config.json`;
  try {
    const config = jsonfile.readFileSync(fPath);
    return Object.keys(config)[0];
  } catch(err) {
    throw new Error(err);
  }
}


// Add a bridge group. This consists of a network entry point (host) and bridge
// contract address on two separate networks that are bridged. They are ordered
// into networkA and networkB based on what the bridge contract addresses evaluate
// to.
exports.addGroup = function(group, dir, cb) {
  const fPath = `${dir}/config.json`;
  let hostA;
  let hostB;
  let addrA;
  let addrB;
  if (parseInt(group[3]) > parseInt(group[1])) {
    hostA = group[0];
    addrA = group[1];
    hostB = group[2];
    addrB = group[3];
  } else {
    hostA = group[2];
    addrA = group[3];
    hostB = group[0];
    addrB = group[1];
  }
  _ifExists(fPath, (err, data, exists) => {
    if (err) { cb(err); }
    else {
      const i = `${addrA}_${addrB}`;
      if (!exists) { data = {}; };
      data[i] = { };
      let isSaved = false;
      Object.keys(data).forEach((k) => {
        if (data[k].hostA == hostA && data[k].hostB == hostB && data[k].addrA == addrA && data[k].addrB == addrB) { isSaved = true; }
      })
      if (isSaved) { cb('Bridge group already saved.'); }
      else {
        data[i].hostA = hostA;
        data[i].hostB = hostB;
        data[i].addrA = addrA;
        data[i].addrB = addrB;
        // Create files for header data
        if (!fs.existsSync(`${dir}/${addrA}`)) { fs.mkdirSync(`${dir}/${addrA}`); }
        if (!fs.existsSync(`${dir}/${addrB}`)) { fs.mkdirSync(`${dir}/${addrB}`); }

        jsonfile.writeFile(fPath, data, { spaces: 2 }, (err, success) => {
          if (err) { cb(err); }
          else { cb(null); }
        })
      }
    }
  })
}

// Add a set of peers to the config file. These are represented as host:port
// and are comma separated. The peer groups are indexed based on the networks
exports.addPeers = function(peers, dir, index, cb) {
  const fPath = `${dir}/config.json`
  _ifExists(fPath, (err, data, exists) => {
    if (err) { cb(err); }
    else {
      if (!exists) { cb('Config file does not exist. Start by adding a bridge with --add') }
      else if (!data[index].peers) { data[index].peers = [] }
      // Add the peers in a list
      let count = 0;
      peers.forEach((peer) => {
        const p = `${peer.host.host}:${peer.host.port}`;
        // Don't add peers already in the list
        // Remember that peers are stored as host names in the config.json file
        // but exist as key-value pairs in memory
        if (!data[index]) { data[index] = { peers: [] }; };
        if (data[index].peers.indexOf(p) == -1) {
          data[index].peers.push(p);
          count ++;
        }
      })
      jsonfile.writeFile(fPath, data, { spaces: 2}, (err, success) => {
        if (err) { cb(err); }
        else { cb(null, count); }
      })
    }
  })
}

// Get saved peers in an index
exports.getPeers = function(dir, index, cb) {
  const fPath = `${dir}/config.json`;
  _ifExists(fPath, (err, data, exists) => {
    if (err) { cb(err); }
    else if (!exists) { cb('No peers saved.'); }
    else {
      loadPeers(data[index].peers, (err, peers) => {
        if (err) { cb(err); }
        else { cb(null, peers); }
      })
    }
  })
}

// Get saved hosts (web3 connectios) in an index
exports.getHosts = function(dir, index, cb) {
  const fPath = `${dir}/config.json`;
  _ifExists(fPath, (err, data, exists) => {
    if (err) { cb(err); }
    else if (!exists) { cb('No peers saved.'); }
    else { cb(null, [ data[index].hostA, data[index].hostB ]); }
  })
}

exports.getAllHosts = function(dir, cb) {
  const fPath = `${dir}/config.json`;
  _ifExists(fPath, (err, data, exists) => {
    if (err) { cb(err); }
    else if (!exists) { cb('No hosts saved.'); }
    else {
      let hosts = [];
      Object.keys(data).forEach((d) => {
        hosts.push([data[d].addrA, data[d].hostA]);
        hosts.push([data[d].addrB, data[d].hostB]);
      })
      cb(null, hosts);
    }
  })
}

function _ifExists(path, cb) {
  jsonfile.readFile(path, (err, f) => {
    if (err && err.code != 'ENOENT') { cb(err); }
    else if (err && err.code == 'ENOENT') { cb(null, {}, false); }
    else { cb(null, f, true); }
  })
}

function loadPeers(hosts, cb, peers={}) {
  if (hosts.length == 0) { cb(null, peers); }
  else {
    const host = hosts.pop();
    const params = host.split(':');
    const peer = new Peer(params[0], params[1]);
    peer.on('error', () => {})
    peer.on('connect', () => { })
    peer.connect();
    peers[host] = peer;
    loadPeers(hosts, cb, peers);
  }
}
exports.loadPeers = loadPeers;
