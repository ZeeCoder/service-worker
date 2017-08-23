if (typeof jQuery !== 'undefined') {
    console.log('jQuery is available');
} else {
    console.log('jQuery is NOT available');
}

let cachingServiceWorker;

function clearAllCache() {
    return postMessageAndExpectResponse(cachingServiceWorker, {
        type: 'ClearAllCache',
    })
        .then(response => {
            console.log('Cache deleted.');
            addMessage('Cache deleted.');

            return response;
        })
        .catch(e => {
            console.error('An error occurred while deleting the cache: ', e);
            addMessage(
                'An error occurred while deleting the cache: ' + String(e)
            );
        });
}

function storeAppCache() {
    console.log(
        'Sending through asset urls to the Service Worker for caching.'
    );

    return postMessageAndExpectResponse(cachingServiceWorker, {
        type: 'StoreInAppCache',
        assetUrlsToCache: [
            '/service-worker/',
            '/service-worker/portrait.jpg',
            '/service-worker/landscape.jpg',
            // 'http://hdwallpaperssys.com/wp-content/uploads/2015/05/Beautiful-road-landscape-image.jpg',
            // '/service-worker/nonexistent.jpg', // uncomment to make caching fail
        ],
    })
        .then(response => {
            console.log('App Caching done.');
            addMessage('App Caching done.');

            return response;
        })
        .catch(e => {
            console.log('An error occurred while caching:', e);
            addMessage('An error occurred while caching: ' + String(e));
        });
}

function hasAppCache() {
    return postMessageAndExpectResponse(cachingServiceWorker, {
        type: 'HasAppCache',
    }).then(has => {
        console.log('hasAppCache response: ', has);
        addMessage('Has app cache: ' + has);

        return has;
    });
}

function getActiveServiceWorker(registration) {
    return new Promise(resolve => {
        const resolveIfActive = () => {
            if (registration.active) {
                resolve(registration.active);
            } else {
                requestAnimationFrame(resolveIfActive);
            }
        };

        resolveIfActive();
    });
}

function isErrorResponse(response) {
    return typeof response === 'object' && response.error;
}

function postMessageAndExpectResponse(sw, message) {
    return new Promise((resolve, reject) => {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = event => {
            if (isErrorResponse(event.data)) {
                reject(new Error(String(event.data.error)));
            } else {
                resolve(event.data);
            }
        };

        sw.postMessage(message, [messageChannel.port2]);
    });
}

const messageContainer = document.getElementById('Message');

function addMessage(message) {
    messageContainer.innerHTML = messageContainer.innerHTML + '<br>' + message;
}

let isWindowLoaded = false;
window.addEventListener('load', () => (isWindowLoaded = true));
function windowLoaded() {
    return new Promise(resolve => {
        const check = () => {
            if (isWindowLoaded) {
                resolve();
            } else {
                requestAnimationFrame(check);
            }
        };

        check();
    });
}

navigator.storage.persist().then(granted => {
    console.log('Persistent storage granted: ', granted);

    navigator.serviceWorker
        .register('./sw.js')
        .then(getActiveServiceWorker)
        .then(sw => {
            cachingServiceWorker = sw;

            postMessageAndExpectResponse(sw, {
                type: 'TheQuestion',
            }).then(answer => {
                console.log('The answer to The Question is: ', answer);
                console.log('...but do you know what The Question is exactly?');
            });

            hasAppCache().then(has => {
                if (has) {
                    addMessage('App Cache was stored previously.');
                    return;
                }

                addMessage('Caching assets...');
                Promise.all([storeAppCache(), windowLoaded()]).then(() => {
                    // Waiting for both the custom App asset urls and
                    // intercepted requests to be cached.
                    addMessage('All Caching done.');
                });
            });
        });
});
