//^^ <--I'm a demo comment, I wouldn't exist in production code

//Import modules for connectivity/tunnel creation
//^^ would look into using node-fetch or axiom in place of http and https on refactor
const http = require('http');
const https = require('https');
const cbt = require('cbt_tunnels');
const date = require('date-and-time');
const fileSystem = require('fs');
const reqPro = require('request-promise');

//^^latest selenium-webdriver not supported by cbt. Down-versioned in NPM
const webDriver = require('selenium-webdriver');

//auth
const userName = "!myEmail";
const authKey = "!myAuthKey";

//paths
const localPath = "brightlightproductions.online.html";
let cbtSeleniumTestAPI = 'https://crossbrowsertesting.com/api/v3/selenium/';
const cbtLiveTestEndPoint = 'https://app.crossbrowsertesting.com/selenium/';
const fqWebAddressToTest = "http://localhost:8080";
const hostname = '127.0.0.1';
const port = 8080;

//globals
let cbtBrowsersJSON;


//creates server to host local page behind firewall for testing
fileSystem.readFile(localPath, (err, html) => {
    if (err) {
        throw err;
    }
    const server = http.createServer((req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-type', 'text/html');
        res.write(html);
        res.end();
    });

    server.listen(port, hostname, () => {
        console.log('Local Server started on port ' + port);
    });
});

const cbtFetchBrowersEndPoint = "https://crossbrowsertesting.com/api/v3/livetests/browsers";
https.get(cbtFetchBrowersEndPoint, res => {
    res.setEncoding("utf8");
    let jsonString = "";
    res.on("data", data => {
        jsonString += data;
    });
    res.on("end", () => {
        cbtBrowsersJSON = JSON.parse(jsonString);
        startCBTTunnelLocalHTML();
    });
});

//start local tunnel pointing CBT API tools to local HTML to test
function startCBTTunnelLocalHTML() {
    cbt.start({"username": userName, "authkey": authKey, "dir": fqWebAddressToTest}, function (err) {
        if (!err)
            console.log("started tunnel successfully!");
        runBrowserTestThroughWebDriver();
    })
}

//creates and sets webDriver to
function runBrowserTestThroughWebDriver() {
    const localFileRef = "http://local";
    let sessionId;
    let score = 'fail';
    let cbtHub = "http://hub.crossbrowsertesting.com:80/wd/hub";
    let capsInParallel =
        [
            buildRandomBrowserCaps('Windows', cbtBrowsersJSON),
            buildRandomBrowserCaps('mobile', cbtBrowsersJSON),
            buildRandomBrowserCaps('Mac', cbtBrowsersJSON)
        ];

    //maps each browser test to its randomized caps and runs individual tests on seperate drivers
    capsInParallel.map(function (browser) {
        let capabilities = {
            name: browser.name,
            browserName: browser.browserName,
            version: browser.version,
            platform: browser.platform,
            screen_resolution: '1366x768',
            username: userName,
            password: authKey
        };
        //^^used to test out applicable browsers, remove logs in production
        console.log("capabilities after map: ");
        console.log(capabilities);

        let driver = new webDriver.Builder()
            .usingServer(cbtHub)
            .withCapabilities(capabilities)
            .build();

        try {
            driver.getSession().then(function (session) {
                sessionId = session.id_;//need for API calls
                console.log('See your test run on ' + cbtLiveTestEndPoint + sessionId);
            });

            driver.get(localFileRef);

            driver.getTitle().then(function (title) {
                if (title === "bris") score = "pass";

                console.log("title is: " + title);
                setScore(sessionId, score);
            })
        } catch (e) {
            console.log('Error: ' + e);
        } finally {
            driver.quit();
        }
    });
}

/*
Picks a random device from @arg deviceType (Win, Mac, Mobile), then a random browser based on supported caps:
@docs https://help.crossbrowsertesting.com/selenium-testing/getting-started/crossbrowsertesting-automation-capabilities/
^^randomness built with flexibility anticipating future browser api caps changes
*/
function buildRandomBrowserCaps(deviceType, cbtServerJSONResponse) {
    let cbtDevicesInCat;
    let numOfCBTDevicesInCat;
    let randSelectedDeviceJSON;
    let indexOfRandCBTDevice;
    let numOfBrowsersInSelectedDevice;
    let indexOfRandCBTBrowser;
    let randSelectedBrowserJSON;

    //filters only @arg:deviceType out of JSON object
    //^^ below necessary as mobile devices separated by .device key, mac and desktop differentiated by .type key in cbt API
    cbtDevicesInCat = deviceType === "mobile" ? cbtServerJSONResponse.filter(function (object) {
        return (object.device === deviceType);
    }) : cbtServerJSONResponse.filter(function (object) {
        return (object.type === deviceType);
    });

    //gets random JSON OS from specified device category
    numOfCBTDevicesInCat = Object.keys(cbtDevicesInCat).length;
    indexOfRandCBTDevice = getRandomInt(0, numOfCBTDevicesInCat - 1);
    randSelectedDeviceJSON = cbtDevicesInCat[indexOfRandCBTDevice];

    //repeat a similar process to get randomized browser object
    numOfBrowsersInSelectedDevice = Object.keys(randSelectedDeviceJSON.browsers).length;
    indexOfRandCBTBrowser = getRandomInt(0, numOfBrowsersInSelectedDevice - 1);
    randSelectedBrowserJSON = randSelectedDeviceJSON.browsers[indexOfRandCBTBrowser];

    //^^why do it the above way?

    let capsBuilder;
    let now = new Date();
    date.format(now, 'YYYY/MM/DD HH:mm:ss');

    //^^ Selenium does not support Opera browser name, another browser randomly selected
    while (randSelectedBrowserJSON.type === 'Opera') {
        randSelectedBrowserJSON = randSelectedDeviceJSON.browsers[getRandomInt(0, numOfBrowsersInSelectedDevice - 1)];
    }

    switch (deviceType) {
        case 'Windows':
            capsBuilder = {
                'name': 'Random ' + deviceType + ' Browser Test: ' + now,
                'build': '1.0',
                'browserName': randSelectedBrowserJSON.type,
                'version': randSelectedBrowserJSON.version,
                'platform': randSelectedDeviceJSON.name,
                'screenResolution': '1366x768'
            };
            break;
        case 'mobile':
            //necessary to match Appium Cap Keys from cbt's browser JSON object
            if (randSelectedDeviceJSON.name.includes('Android')) {
                randSelectedBrowserJSON.type = 'chrome';
            } else {
                randSelectedBrowserJSON.type = 'safari';
            }
            capsBuilder = {
                'name': 'Random ' + deviceType + ' Browser Test: ' + now,
                //^^Didn't see in docs or JSON return any mobile iOS device types
                'browserName': randSelectedBrowserJSON.type,
            };
            break;
        case 'Mac':
            //defaults to latest version and appropriate platform.
            // ^^Some cbt version numbers and platforms mismatch supported Selenium?
            capsBuilder = {
                'name': 'Random ' + deviceType + ' Browser Test: ' + now,
                'browserName': randSelectedBrowserJSON.type,
                'screenResolution': '1366x768'
            };
            break;
    }
    return capsBuilder;
}

function getRandomInt(min, max) {
    return Math.floor(Math.floor(Math.random() * (max - min + 1)) + min);
}

//sets score value to CBT test app
function setScore(sessionId, score) {
    let options = {
        method: 'PUT',
        uri: cbtSeleniumTestAPI + sessionId,
        json: true,
        body: {
            action: 'set_score',
            score: score
        },
        auth: {
            username: userName,
            password: authKey
        }
    };
    reqPro(options)
        .then(function () {
            console.log("score set as: " + score);
        })
        .catch(function (err) {
            console.log(" Score Failed with Error: " + err);
        });
}









