const pngToIco = require('png-to-ico');
const fs = require('fs');

pngToIco('./assets/icon.png')
    .then(buf => {
        fs.writeFileSync('./assets/icon.ico', buf);
        console.log('ICO file created successfully!');
    })
    .catch(console.error);
