(() => {
  'use strict';
  // Exact optional hosts only. NetMirror remains covered by the manifest script.
  globalThis.NMGSites = Object.freeze([
    Object.freeze({
      id:'netflix', key:'netflixEnabled', label:'Netflix',
      origins:Object.freeze(['https://www.netflix.com/*','https://netflix.com/*']),
      registrationId:'nmg-official-netflix'
    }),
    Object.freeze({
      id:'prime', key:'primeEnabled', label:'Prime Video',
      origins:Object.freeze(['https://www.primevideo.com/*','https://primevideo.com/*']),
      registrationId:'nmg-official-prime'
    })
  ]);
})();
