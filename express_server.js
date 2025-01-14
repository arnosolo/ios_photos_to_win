const express = require('express');
const formidable = require("formidable")
var logger = require('morgan');
const fs = require("fs")
// const os = require('os')
const path = require('path')
const { Notification, shell, clipboard, nativeImage } = require('electron')

const util = require('./utils/util')
const Store = require('./utils/Store')
let shareFilePath = []
function setShareFilePath(newPath) {
  shareFilePath = newPath
  console.log(shareFilePath);
}

var os=require('os'),
    iptable={},
    ifaces=os.networkInterfaces();
for (var dev in ifaces) {
  ifaces[dev].forEach(function(details,alias){
    if (details.family=='IPv4') {
      iptable[dev+(alias?':'+alias:'')]=details.address;
    }
  });
}
console.log(iptable);


/* 1/4 创建express对象 */
const app = express()
const port = 4000

// 创建配置文件读写对象
const store = new Store({
  configName: 'user-preferences',
  defaults: {
    imgClipSize: 1000, // 剪切板图片最大尺寸
    savePath: '/Pictures' // 保存路径 使用path.join可以解决win的路径分隔符为\的问题
  }
});

/* 2/4 加载中间件 */
app.use(express.urlencoded({ extended: false }))
app.use(express.json())
app.use(logger('dev'));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');
app.engine('.html', require('ejs').__express);

/* 3/4 决定如何响应请求 */
/* 渲染网页端 */
app.get('/', (req, res) => {
  res.render('index', { title: '' });
})

/* 处理发来的消息 */
app.post('/msg', function (req, res) {
  const { msg } = req.body
  clipboard.writeText(msg)

  // 显示系统通知
  const notification = new Notification({
    title: 'Text --> Clipboard',
    body: `${msg}`,
    icon: path.join(__dirname, './static/img/clipboard.png'),
  })
  // 如果包含网址,点击可打开
  const urlArray = msg.match(/((https?:\/\/)+[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)/g)
  notification.on('click', () => {
    if (urlArray != null) {
      // notification.body = `click me to open the webpage ${msg}`
      shell.openExternal(urlArray[0])
    }
  })
  notification.show()

  console.log('Msg received:', msg);
  res.send({ success: true, msg: 'success' })
})

const copyFile = (from, to) => {
  return new Promise((resolve, reject) => {
    const copy = fs.createReadStream(from).pipe(fs.createWriteStream(to))
    copy.on('close', () => resolve('copy finish'))
    copy.on('error', () => reject('copy error'))
  })
}

const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, err => {
      if (err) {
        reject(err)
        return
      }
    })
    resolve(`successfully delete ${filePath}`)
  })
}


/* 处理发来的文件 */
app.post('/upload', function (req, res) {
  // 获取用户信息
  var { homedir } = os.userInfo()

  // 1.解析表单
  var form = new formidable.IncomingForm();
  form.parse(req, function (err, fields, files) {
    if (err) throw err
    for (let key in files) {
      let file = files[key]
      console.log('Incoming file:', file.name);
      // 过滤空文件
      if (file.size == 0 && file.name == '') continue

      /* 2.保存文件到指定文件夹 */
      const fileName = path.basename(file.name, path.extname(file.name))
      const fileType = path.extname(file.name)
      const oldPath = file.path
      const savePath = store.get('savePath')
      const saveDir = path.join(homedir, savePath)
      // 如果文件夹不存在，创建
      util.checkDirExist(saveDir)
      const newPath = path.join(saveDir, (fileName + '_' + Date.now() + fileType))

      /* 
        3.保存文件后
          3.1 将图片添加到剪切板
          3.2 发送一条系统通知
          3.3 删除临时文件 
      */

      const copyAndDelete = async () => {
        // 保存文件
        await copyFile(oldPath, newPath)

        // 将图片添加到剪切板
        let receivedImage = nativeImage.createFromPath(newPath)
        let imgClip = {}
        const imgClipSize = store.get('imgClipSize') * 1 // 读取用户配置
        const resizeImg = (image, size) => {
          const { width, height } = image.getSize()
          return (width > height) ? image.resize({ width: size }) : image.resize({ height: size })
        }
        switch (fileType) {
          case '.jpeg':
            imgClip = resizeImg(receivedImage, imgClipSize)
            break;
          case '.jpg':
            imgClip = resizeImg(receivedImage, imgClipSize)
            break;
          default:
            imgClip = receivedImage
        }
        clipboard.writeImage(imgClip)

        // 显示系统通知
        const notification = new Notification({
          title: 'File --> Picture folder',
          body: `click me to open ${fileName}`,
          icon: path.join(__dirname, './static/img/clipboard.png'),
        })
        notification.on('click', () => { // 点击通知跳转到资源管理器
          shell.showItemInFolder(newPath)
          console.log('Notification clicked:', fileName)
        })
        notification.show()
        console.log('hello');

        // 删除临时文件
        await deleteFile(oldPath)
      }

      copyAndDelete()


      // var readStream = fs.createReadStream(oldPath)
      // var writeStream = fs.createWriteStream(newPath)
      // readStream.pipe(writeStream)
      // readStream.on('error', err => {
      //   if (err) throw err
      // });

      // readStream.on('close', function(){
      //   // res.status(500).send({ error: 'Something failed!' })
      //     console.log('File saved: ', file.name);

      //     // 将图片添加到剪切板
      //     let receivedImage = nativeImage.createFromPath(newPath)
      //     let imgClip = {}
      //     const imgClipSize = store.get('imgClipSize')*1 // 读取用户配置
      //     const resizeImg = (image, size) => {
      //       const {width, height} = image.getSize()
      //       return (width > height) ? image.resize({width:size}) : image.resize({height:size})
      //     }
      //     switch(fileType) {
      //       case '.jpeg':
      //         imgClip = resizeImg(receivedImage, imgClipSize)
      //         break;
      //       case '.jpg':
      //         imgClip = resizeImg(receivedImage, imgClipSize)
      //         break;
      //       default:
      //         imgClip = receivedImage
      //     }
      //     clipboard.writeImage(imgClip)

      //     // 显示系统通知
      //     const notification = new Notification({
      //       title: 'File --> Picture folder',
      //       body: `click me to open ${file.name}`,
      //       icon: path.join(__dirname,'./static/img/clipboard.png'),
      //     })
      //     notification.show()
      //     // 点击通知跳转到资源管理器
      //     notification.on('click' , () => {
      //         shell.showItemInFolder(newPath)
      //         console.log('Notification clicked:', file.name)
      //     })

      //     // 删除临时文件
      //     fs.unlink(oldPath, (err) => {
      //       if (err) throw err
      //     }) 


      // });

    }

    res.send({ success: true, msg: 'File transfer success.' })
  })

});

/* 分享本机文件 */
app.get('/api/share_file', function (req, res) {
  // const filePath = path.join(__dirname, 'static/img/alipay_qrcode.jpeg')
  console.log(shareFilePath[0]);
  if(shareFilePath[0] == undefined) {
    res.send({code: 0, msg: "Please choose a file first."});
  } else {
    res.sendFile(shareFilePath[0])
  }
  
})

app.get("/api/get_pubip", (req, res) => {
  const { ip } = req;
  res.send({code: 0, data: {ip}, msg: "success"});
})

/* 4/4开始监听请求 */
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`)
})

const express_server = app
module.exports = {express_server, setShareFilePath};