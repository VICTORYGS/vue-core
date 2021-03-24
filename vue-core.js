import * as acorn from './acorn.mjs'
function isObj(obj) {
    return Object.prototype.toString.call(obj).match(/Object|Array/)
}
function reserved(obj) {
    let proxy = new Proxy(obj, {
        set(target, p, value, receiver) {
            if(isObj(target[p])){
                // handlers 传递
                dataMaps.set(value,dataMaps.get(target[p]))
            }
            target[p]=value
            dataMaps.get(target).get(p).forEach(fn=>fn())
            return true
        },
        get(target, p, receiver) {
            let handleMap = dataMaps.get(target)
            if(!handleMap){
                handleMap=new Map()
                dataMaps.set(target,handleMap)
            }
            if(!handleMap.get(p)){
                handleMap.set(p,[])
            }
            currentHandle&&handleMap.get(p).push(currentHandle);
            // Array 方法的重写
            if(Array.isArray(target)){
                const methodsOfArray=['push','shift','unshift','pop','splice','sort','reverse']
                if(methodsOfArray.includes(p)){
                    return function(...args){
                        Array.prototype[p].apply(target,args)
                        for(let [_,fns] of dataMaps.get(target)){
                            fns.forEach(fn=>fn())
                        }
                    }
                }
            }

            if(isObj(target[p])){
                // 若为对象返回一个proxy
                return reserved(target[p])
            }
            return target[p]
        }
    })
    return proxy
}
const dataMaps = new WeakMap();//自动剔除失效handlers
const keyToVal=(obj,key,node)=>{
    let res;
    const fromVFor=()=>{
        if(node&&res===undefined){
            let p=node
            while (p){
                let val;
                try {
                    val=eval(`p.vFor.${key}`)
                }catch(e){
                }
                if(val===undefined){
                    p=p.parentNode
                }else{
                    return res=val
                }
            }
        }
    }
    try {
        res=eval(`obj.${key}`)
        fromVFor()
    }catch(e){
        fromVFor()
    }
    return res
};
let currentHandle=null
export class Vue {
    constructor(config) {
        let node = document.querySelector(config.el)
        const data=(typeof config.data) == 'function' ? config.data() : config.data;
        this.data = reserved(data);
        Object.keys(data).forEach(key=>{
          Object.defineProperty(this,key,{
              get:()=>{
                  return this.data[key]
              },
              set:v=> {
                  this.data[key]=v
                  return true
              }
          })
        })
        Object.assign(this,config.methods)
        this.directives=config.directives
        this.traverse(node)
    }
    traverse(node) {
        let isBreak=false;
        const handleText = () => {
            if (node.nodeType == Node.TEXT_NODE) {
                node.textContent.replace(/{{[\S\s]*?}}/g,(s,index)=>{
                    let range=document.createRange()
                    range.setStart(node,index)
                    range.setEnd(node,index+s.length)
                    currentHandle=()=>{
                        range.deleteContents()
                        range.insertNode(document.createTextNode(keyToVal(this,s.replace(/{|}/g, '').trim(),node)))
                    }
                    currentHandle()
                    currentHandle=null//清除
                })
            }
        }
        if(node.attributes){
            let attrbutesSort=[]
            for(let attr of node.attributes){//vFor to be first
                if(attr.name=='v-for'){
                    attrbutesSort.unshift(attr)
                }else attrbutesSort.push(attr)
            }
            for(let attr of attrbutesSort){
                let oneRegHandles=[
                    {
                        reg:/v-for/,
                        handle:(match)=>{
                            node.removeAttribute(attr.name)// 防止重复解析v-for
                            const expression=attr.value.trim()
                            let arr=expression.split(/ of | in /).map(v=>v.trim())
                            if(arr.length==2){
                                let range=document.createRange()
                                range.setStartAfter(node)
                                range.setEndAfter(node)
                                node.parentNode.removeChild(node)
                                currentHandle=()=>{
                                    let arrRes=keyToVal(this,arr[1])
                                    if(Array.isArray(arrRes)){
                                        let container=document.createDocumentFragment()
                                        arrRes.forEach((v,i)=>{
                                            let obj={}
                                            arr[0].replace(/\(|\)/g,'').split(',').map(v=>v.trim()).forEach((item,index)=>{
                                                if(item){
                                                    obj[item]=index?i:v
                                                }
                                            })
                                            let cloneNode=node.cloneNode(true)
                                            cloneNode['vFor']=obj
                                            container.appendChild(cloneNode)
                                            this.traverse(cloneNode)

                                        })
                                        // 清除原内容
                                        range.deleteContents()
                                        range.insertNode(container)
                                        container=null
                                        isBreak=true
                                    }else {
                                        throw new Error('v-for required Type is Array')
                                    }
                                }
                                currentHandle()
                                currentHandle=null//清除

                            }
                        }
                    },
                    {
                        reg:/@(\w+)/,
                        handle:(match)=>{
                            let event=match[1]
                            const fnName=attr.value.trim()
                            let fn=this[fnName]
                            typeof fn=='function'&&node.addEventListener(event,()=>{
                                fn.call(this,node)
                            });
                        }
                    },
                    {
                        reg:/^v-bind$/,
                        handle:(match)=>{
                            currentHandle=()=>{
                                node.textContent=keyToVal(this,attr.value.trim());
                            }
                            currentHandle()
                            currentHandle=null
                        }
                    },
                    {
                        reg:/v-model/,
                        handle:(match)=>{
                            node.value=this[attr.value.trim()]
                            node.addEventListener('input',()=>{this[attr.value.trim()]=node.value});
                        }
                    },
                    {
                        reg:/v-(\w+)/,
                        handle:(match)=>{
                            const name=match[1]
                            const {bind}=this.directives[name]
                            const expression=attr.value.trim()
                            const binding={
                                name,
                                expression,
                            }
                            if(expression){
                                var value=expression
                                try{
                                    value=eval.call(this,expression)
                                }catch (e) {
                                }
                                binding.value=value
                            }
                            bind.apply(this,[node,binding])
                        }
                    },
                    {
                        reg:/:([\S\s]+)/,
                        handle:(match)=>{
                            const expression=attr.value.trim()
                            let attrName=match[1]
                            switch (attrName) {
                                case 'class':
                                    var ast = acorn.parse("(" + expression + ")");
                                    try{
                                        ast.body[0].expression.properties.forEach(v=>{
                                            let k=v.key.name
                                            currentHandle=()=>{
                                                if(keyToVal(this,v.value.name)){
                                                    node.classList.add(k)
                                                }else{
                                                    node.classList.remove(k)
                                                }
                                            }
                                            currentHandle()
                                            currentHandle=null
                                        })
                                    }catch (e) {

                                    }
                                    break;
                                case 'style':
                                    var ast = acorn.parse("(" + expression + ")");
                                    try{
                                        ast.body[0].expression.properties.forEach(v=>{
                                            let k=v.key.name
                                            currentHandle=()=>{
                                                if(/_/.test(k)){
                                                    node.style.setProperty(k,keyToVal(this,v.value.name))
                                                }else{
                                                    node.style[k]=keyToVal(this,v.value.name)
                                                }
                                            }
                                            currentHandle()
                                            currentHandle=null
                                        })
                                    }catch (e) {

                                    }
                                    break;
                                default:
                                    attrName=attrName.trim()
                                    if(attrName){
                                        currentHandle=()=>{
                                            node.setAttribute(attrName,keyToVal(this,expression,node))
                                        }
                                        currentHandle()
                                        currentHandle=null
                                    }
                            }
                        }
                    }
                ]
                oneRegHandles.some(v=>{
                    let match=attr.name.match(v.reg);
                    if(match){
                        v.handle(match);
                    }
                    return match
                })
            }
        }
        if(isBreak){return}
        if (node.childNodes && node.childNodes.length) {//还有子集就交由子集处理
            for (let n of node.childNodes) {
                this.traverse(n)
            }
        } else {
            handleText()
        }
    }
}
