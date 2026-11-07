const { Innertube, Utils } = require('youtubei.js');
const fs = require('fs');

(async () => {
  try {
    console.log('Loading cookies.txt...');
    let cookieHeader = '';
    const cookiePath = 'release/win-unpacked/resources/backend/data/cookies.txt';
    if (fs.existsSync(cookiePath)) {
      const lines = fs.readFileSync(cookiePath, 'utf8').split('\n');
      const pairs = [];
      for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue;
        const parts = line.split('\t');
        if (parts.length >= 7) {
          pairs.push(`${parts[5].trim()}=${parts[6].trim()}`);
        }
      }
      cookieHeader = pairs.join('; ');
    }
    console.log('Cookie header length:', cookieHeader.length);

    console.log('Creating Innertube instance with cookies...');
    const yt = await Innertube.create({
      cookie: cookieHeader
    });

    const vids = ['kUKcuZkum8M', 'vyg5jJrZ42s'];
    for (const vid of vids) {
      console.log(`\nTesting video: ${vid}...`);
      try {
        const info = await yt.getInfo(vid);
        console.log('Title:', info.basic_info.title);
        console.log('Playability status:', info.playability_status.status);
        console.log('Streaming data adaptive formats:', info.streaming_data?.adaptive_formats?.length);
        
        console.log('Attempting yt.download for', vid);
        const stream = await yt.download(vid, {
          type: 'audio',
          quality: 'best'
        });

        const chunks = [];
        let total = 0;
        for await (const chunk of Utils.streamToIterable(stream)) {
          chunks.push(chunk);
          total += chunk.length;
          if (total > 100000) {
            console.log(`SUCCESS! Downloaded ${total} bytes for ${vid}!`);
            break;
          }
        }
        console.log(`Video ${vid} WORKS 100%!`);
      } catch (err) {
        console.error(`Failed for ${vid}:`, err.message);
      }
    }
  } catch (e) {
    console.error('General error:', e);
  }
})();
