const net = require('net')

// the way it works is that every server(http server in this case)
// maintains a socket connection. it is in this connection/channel that
// we find information about incoming and outgoing data(requests and responses)
// so we can parse this data to get access to this information
// lucky enough most libraries do it for us
// http module works on top of net module

const createWebServer = (requestHandler) => {
    const server = net.createServer()
    server.on('connection', handleConnection)

    function handleConnection(socket){
        socket.once('readable', () => {
            // set up a buffer to hold the incoming data
            let reqBuffer = Buffer.from('')
    
            // set up a temporary buffer to read incoming data in chunks
            let buff;
            let reqHeader;
            while(true){
                // read the data from the socket
                buff = socket.read()
                if(buff === null) break
                reqBuffer = Buffer.concat([reqBuffer, buff])
    
                // check for end of request header
                let marker = reqBuffer.indexOf('\r\n\r\n')
                if(marker !== -1){
                    // If we reached \r\n\r\n, there could be data after it. Take note.
                    let remaining = reqBuffer.slice(marker + 4)
                    // The header is everything we read, up to and not including \r\n\r\n
                    reqHeader = reqBuffer.slice(0, marker).toString()
    
                    // This pushes the extra data we read back to the socket's readable stream
                    socket.unshift(remaining)
                    break
                }
            }
    
            /* request related business */
            // start parsing the header we got from the socket stream
            const reqHeaders = reqHeader.split('\r\n')
            // First line is special
            const reqLine = reqHeaders.shift().split(' ')
            // Further lines are one header per line, build an object out of it.
            const headers = reqHeaders.reduce((acc, currentHeader) => {
                const [key, value] = currentHeader.split(':');
                return {
                ...acc,
                [key.trim().toLowerCase()]: value.trim()
                };
            }, {});
    
            // this object will be sent to the handleRequest callback
            const request = {
                method: reqLine[0],
                url: reqLine[1],
                httpVersion: reqLine[2].split('/')[1],
                headers,
    
                // The user of this web server can directly read from the socket to get the request body
                // remember in case of any request body, we did not read it
                // we just pushed it back to the stream using the unshift method above.
                socket
            }
    
            /* Response-related business */
            // Initial values
            let status = 200, statusText = 'OK', headersSent = false, isChunked = false;
            const responseHeaders = {
                server: 'nangosha-node-server'
              };
    
            const setHeader = (key, value) => {
                responseHeaders[key.toLowerCase()] = value;
            }
    
            const sendHeaders = () => {
                // we only get to send the request headers ONCE!!!!!!!!
                if (!headersSent) {
                    headersSent = true;
                    // Add the date header
                    setHeader('date', new Date().toGMTString());
                    // Send the status line
                    socket.write(`HTTP/1.1 ${status} ${statusText}\r\n`);
                    // Send each following header
                    Object.keys(responseHeaders).forEach(headerKey => {
                      socket.write(`${headerKey}: ${responseHeaders[headerKey]}\r\n`);
                    });
                    // Add the final \r\n that delimits the response headers from body
                    socket.write('\r\n');
                }
            }
    
            const response = {
                write(chunk) {
                    if (!headersSent) {
                      // If there's no content-length header, then specify Transfer-Encoding chunked
                      if (!responseHeaders['content-length']) {
                        isChunked = true;
                        setHeader('transfer-encoding', 'chunked');
                      }
                      sendHeaders();
                    }
                    if (isChunked) {
                      const size = chunk.length.toString(16);
                      socket.write(`${size}\r\n`);
                      socket.write(chunk);
                      socket.write('\r\n');
                    }
                    else {
                      socket.write(chunk);
                    }
                },
                end(chunk) {
                    if (!headersSent) {
                      // We know the full length of the response, let's set it
                      if (!responseHeaders['content-length']) {
                        // Assume that chunk is a buffer, not a string!
                        setHeader('content-length', chunk ? chunk.length : 0);
                      }
                      sendHeaders();
                    }
                    if (isChunked) {
                      if (chunk) {
                        const size = (chunk.length).toString(16);
                        socket.write(`${size}\r\n`);
                        socket.write(chunk);
                        socket.write('\r\n');
                      }
                      socket.end('0\r\n\r\n');
                    }
                    else {
                      socket.end(chunk);
                    }
                },
                setHeader,
                setStatus(newStatus, newStatusText) { status = newStatus, statusText = newStatusText },
                // Convenience method to send JSON through server
                json(data) {
                    if (headersSent) {
                      throw new Error('Headers sent, cannot proceed to send JSON');
                    }
                    const json = new Buffer(JSON.stringify(data));
                    setHeader('content-type', 'application/json; charset=utf-8');
                    setHeader('content-length', json.length);
                    sendHeaders();
                    socket.end(json);
                }
            }
    
            // send the request to the handler
            requestHandler(request, response)    
        })
    }
    
    return {
        listen: port => server.listen(port)
    }
}

const webServer = createWebServer((req, res) => {
    // this is like the http module
    // it is like we implemented the http module from scratch
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    res.setHeader('Content-Type','text/plain')
    res.end('hello, nangosha')
})

webServer.listen(3031)