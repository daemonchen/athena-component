'use strict';

const 
  os = require('os'),
  fs = require('fs'),
  path = require('path'),

	Koa = require('koa'),
  app = new Koa(),
  router = require('koa-router')(),
  serve = require('koa-static-server'),
  koaBody = require('koa-body'),

  AdmZip = require('adm-zip'),
  unzip = require('unzip'),
  UUID = require('node-uuid'),
  fstream = require('fstream'),
  mongoose = require('mongoose'),

  conf = require('./ac-config.js');

// 连接数据库
mongoose.connect(conf.mongodb.uri, conf.mongodb.options);

var Schema = mongoose.Schema;
var ComponentSchema = new Schema({
  uuid: { type: String, unique: true },
  name: String,
  description: String,
  appId: String,
  moduleId: String,
  author: String,
  platform: String,
  pushDate: { type: Date, default: Date.now },
  pullTimes: { type: Number, default: 0 }
});
var Component = mongoose.model('Component', ComponentSchema);

app
  .use(router.routes())
  .use(router.allowedMethods())
  .use(serve({rootDir:conf.app}));

/**
 * POST: appId, moduleId, platform [, description, author]
 * 上传组件数据
 */
router.post('/api/push', koaBody({
  multipart: true,
  formidable:{
    uploadDir: os.tmpdir(),
    // @params 字段名 文件OBJ
    onFileBegin: function(name, file) {}
  }
}), function *() {
  yield new Promise(resolve => {
    let that = this;
    let uuid = UUID.v1();
    let fields = this.request.body.fields;
    let widget = this.request.body.files.widget;
  
    if(!widget) { this.status = 404; return; }
  
    let wname = path.basename(widget.name, '.zip');
    let distDir = path.join(conf.warehouse, uuid);
  
    fs.mkdir(distDir, function (err) {
  
      let readStream = fs.createReadStream( widget.path );
      let writeStream = fstream.Writer(distDir);
  
      writeStream.on('close', function() {
        let wc = require(path.join(distDir, wname+'.json'));
        let author = fields.author || wc.author || '';
        let description = fields.description || wc.description || '';
        // 存数据库
        let c = new Component({
          uuid: uuid,
          name: wname,
          description: description,
          appId: fields.appId,
          moduleId: fields.moduleId,
          author: author,
          platform: fields.platform
        });
        c.save(function(err) {
          if(err) {
            console.log(err);
            that.status = 500;
          } else {
            that.status = 200;
          }
          resolve();  //Resolve
        });
      });
  
      readStream
        .pipe(unzip.Parse())
        .pipe(writeStream);
    });
  });
});

// 通过id拉取组件打包文件
router.get('/api/pull/:uuid', function *() {
  let uuid = this.params.uuid;
  let zip = new AdmZip();
  zip.addLocalFolder(path.join(conf.warehouse, uuid));
  this.body = zip.toBuffer();
});

router.get('/api/test', function *(){
  setTimeout(() => {
      this.body = 'wwww';
  }, 1000);
});

// app.use(async (ctx, next) => {
//   try {
//     await next();
//   } catch (err) {
//     ctx.body = { message: err.message };
//     ctx.status = err.status || 500;
//   }
// });

// app.use(async ctx => {
//   const user = await User.getById(ctx.session.userid);
//   ctx.body = user;
// });

app.listen(conf.port);