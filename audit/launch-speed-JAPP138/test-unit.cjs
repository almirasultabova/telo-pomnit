const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');process.chdir(path.join(root,'output/launch-speed-JAPP138/source'));
const code=fs.readFileSync(path.join(root,'scripts/test-launch.cjs'),'utf8');vm.runInThisContext('(function(require){'+code+'\n})',{filename:__filename})(require);
