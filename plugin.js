
const path = require("path")
const {forEach} = require('p-iteration')
module.exports = {
		// Init method
		async init(){
			/**
			 * Blog section in config.yaml must look like this (optional):
			 * blog:
			 *  regex:
			 * 		posts: ^blog\/(?!tag).+ # Pages are feeded to blog page, tags pages and paginator
			 *    split: '\<p\>[:=_-]{3,}\<\/p\>' # Regex to split teaser and full view, for PARSED content in html
			 *  index: "news" # `blog` by default, virtual page. If page exists, data will be proceed to that page
			 */
			cogear.config.blog = cogear.config.blog || {
				index: false, // Means `auto`, do it for me
				regex: {}
			}
			this.perPage = cogear.config.blog.perPage || 3
			this.regex = {
				posts: new RegExp(cogear.config.blog.regex.posts || '^blog\/(?!tag).+','i'),
				split: new RegExp(cogear.config.blog.regex.cut || '\<p\>[:=_-]{3,}\<\/p\>','img')
			}

			let result = await cogear.emit('preload.page',[null,{
				// title: 'Blog',
				content: '',
				file: 'blog.md',
				uri: 'blog',
				layout: 'blog'
			}])
			this.pages = {
				"": result.shift()
			}
		},
		apply(){
			// 1. Init on preload (when config has already been loaded)
			cogear.on('preload.done',async ()=>{
				await this.init()
				await this.build()
			})
			// 2. Handle pages preloading
			cogear.on('build.page.layout',async ([page])=>{
				// If it's a blog page - do not render it # Will cause failure without `posts` variable (will set later)
				if(this.regex.posts.test(page.uri)){
					page.content = page.content.replace(this.regex.split,'') // Hide splitter ====
				}
			})
			// 3. If page changed - watcher
			cogear.on('watcher.change.page',async(file)=>{
				if(this.regex.posts.test(file)){
					await this.rebuild()
				}
			})
			cogear.on('watcher.add.page',async(file)=>{
				if(this.regex.posts.test(file)){
					await this.rebuild()
				}
			})
			cogear.on('watcher.unlink.page',async([file,page])=>{
				if(this.regex.posts.test(page.uri)){
					if(this.pages[page.uri]){
						delete this.pages[page.uri]
					}
					await this.rebuild()
				}
			})
			// cogear.on('preload.done',async ()=>{
			// 	await this.build()
			// })
		},
		async rebuild(){
			await this.build()
			Object.entries(this.pages).forEach(async ([uri,page])=>{
				await cogear.emit('build.page',page)
			})
		},
		// Blog index build		
		async build(){
			let blog = this.pages[""]
			Object.keys(this.pages).forEach(key=>{
				if(key != ""){
					delete this.pages[key]
				}
			})
			return new Promise(async(resolve,reject)=>{
				blog.tags = []
				// Get posts, map and sort them
				let posts = Object.entries(cogear.pages)
				.filter(([file,p])=>this.regex.posts.test(p.uri))
				.map(([file,post])=>{
					if(post.tags){
						blog.tags = blog.tags.concat(post.tags).filter((v, i, a) => a.indexOf(v) === i)
					}
					return post
				})
				.filter(post=>{
					let isTagPage = false
					blog.tags.forEach(tag=>{
						isTagPage = post.uri == path.join(blog.uri,tag)
					}) 
					return !isTagPage
				})
				.map(post=>{
					if(typeof post.content == 'string'){
						// Get post teaser which is splitted by ===
						post.teaser = post.content.split(this.regex.split).shift() // Only before splitter
						post.content = post.content.replace(this.regex.split,'') // Hide splitter ====
					}
					return post
				})
				.sort((a,b)=>{
					let aDate = new Date(a.date).getTime()
					let bDate = new Date(b.date).getTime()
					// Sort in DESC order
					return aDate > bDate ? -1 : 1;
				})
				if(!posts.length) return
				await this.buildPages(blog,posts)
				if(blog.tags){
					await forEach(blog.tags,(async(tag)=>{
						let tagPage = {...blog}
						tagPage.tag = tag
						// tagPage.pagination = null
						tagPage.uri = path.join(blog.uri,'tag',tag)
						// tagPage.path = path.join('tags',tag,'index.html')
						await this.buildPages(
							tagPage,
							posts.filter(post=>Array.isArray(post.tags) && post.tags.includes(tag))
						)
						tagPage = (await cogear.emit('preload.page',[null,tagPage])).shift()
						cogear.pages[tagPage.uri] = tagPage
						this.pages[tagPage.uri] = tagPage
					}))
				}
				resolve()
			})
		},
		async buildPages(page,posts){
				let paginator = {
					count: posts.length,
					current: 1,
					perPage: this.perPage,
					total: Math.round(posts.length/this.perPage),
					next: '',
					prev: ''
				}
				// If there is more than 1 page
				if(paginator.total > 1){
					let pageNum = 2
					
					while(pageNum <= paginator.total){
						let newPage = {...page}
						let start = this.perPage*(pageNum-1)
						let end = start + this.perPage
						
						newPage.posts = posts.slice(start,end)
						newPage.path = path.join(page.uri,pageNum + '','index.html')
						newPage.uri = path.join(page.uri,pageNum + '/')
						newPage.paginator = {...paginator}
						newPage.paginator.current = pageNum
						
						if(pageNum < paginator.total){
							newPage.paginator.next = path.join(page.uri,(pageNum+1)+'',)
						}
						
						newPage.paginator.prev = pageNum > 2 ? path.join(page.uri,(pageNum-1)+'',) : page.uri
						newPage.content = cogear.parser.render(newPage.__content, newPage)
						
						cogear.pages[newPage.uri] = newPage 
						this.pages[newPage.uri] = newPage
						pageNum = pageNum+1
					}
					paginator.next = path.join(page.uri,'2/')
					page.posts = posts.slice(0,this.perPage)
					
					page.paginator = paginator
				} else {
					page.posts = posts
				}		
		}
}