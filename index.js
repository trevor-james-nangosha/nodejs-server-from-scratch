const http = require('http')
const server = http.createServer()
server.on('request', (req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello world')
})

server.listen(3030)