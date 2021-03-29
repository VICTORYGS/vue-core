import * as acorn from './acorn.mjs'
function isObj(obj) {
    return Object.prototype.toString.call(obj).match(/Object|Array/)
}
const dataMaps = new WeakMap();//自动剔除失效handlers
class nextTickQue {
    constructor() {
        this.que=[]
        this.QueOfNextTick=new Set//nextTick自动去重
        this.isActive=false
    }
    nextTick(fn){
        this.QueOfNextTick.add(fn)
    }
    fnQueAdd(...fns){
        this.que.push(...fns)
        if(this.isActive)return;
        //使用微任务 进行异步处理
        Promise.resolve().then(this.consume.bind(this))
        this.isActive=true
    }
    consume(){
        let fn=this.que.shift()
        while(fn){
            fn()
            fn=this.que.shift()
        }
        this.isActive=false
        for (const fn of this.QueOfNextTick) {
            fn()
        }
        this.QueOfNextTick.clear()//清空全部
    }
}
function reserved(obj,isRootData) {
    if(isRootData){
        var nextTickIns=new nextTickQue
        var nextTick=nextTickIns.nextTick.bind(nextTickIns);
        var fnQueAdd=nextTickIns.fnQueAdd.bind(nextTickIns);
    }
    let proxy = new Proxy(obj, {
        set(target, p, value, receiver) {
            if(isObj(target[p])){
                // handlers 传递
                dataMaps.set(value,dataMaps.get(target[p]))
            }
            target[p]=value
            //多次更改 批量执行
            fnQueAdd(...dataMaps.get(target).get(p))
            /*dataMaps.get(target).get(p).forEach(fn=>{
                fn()
            })*/
            return true
        },
        get(target, p, receiver) {
            if(isRootData&&p=='$nextTick'){
                return nextTick
            }
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
        this.data = reserved(data,true);
        ['$nextTick'].concat(Object.keys(data)).forEach(key=>{
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
        function exeHandler() {
            if(currentHandle){
                currentHandle()
                currentHandle=null
            }
        }
        const next=node=> {
            let {childNodes}=node||[]
            childNodes=Array.from(childNodes)
            if (childNodes.length) {//还有子集就交由子集处理
                for (let n of childNodes) {
                    this.traverse(n)
                }
            } else {
                handleText()
            }
        }
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
                    exeHandler()
                })
            }
        }
        if(node.attributes){
            let attrbutesSort=[]
            let firstArr=[]
            for(let attr of node.attributes){//vFor to be first
                if(attr.name=='v-for'){
                    firstArr.push(attr)
                }else if(attr.name=='v-if'){
                    firstArr.unshift(attr)
                }else attrbutesSort.push(attr)
            }
            for(let attr of firstArr.concat(attrbutesSort)){
                let oneRegHandles=[
                    {
                        reg:/v-for/,
                        handle:(match)=>{
                            // node.removeAttribute(attr.name)// 防止重复解析v-for
                            let isInit=false
                            const expression=attr.value.trim()
                            let arr=expression.split(/ of | in /).map(v=>v.trim())
                            if(arr.length==2){
                                //v-if的特殊处理
                                currentHandle=()=>{
                                    const range=document.createRange();
                                    let rangeStart=node,rangeEnd=node;
                                    if(node.nextNode){
                                        if(Array.isArray(node.nextNode)){
                                            [rangeStart,rangeEnd]=node.nextNode
                                        }else{
                                            rangeStart=rangeEnd=node
                                        }
                                    }
                                    range.setStartBefore(rangeStart)
                                    range.setEndAfter(rangeEnd)
                                    let arrRes=keyToVal(this,arr[1],node)
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
                                            cloneNode.removeAttribute(attr.name)//剔除子集v-for
                                            cloneNode['vFor']=obj
                                            container.appendChild(cloneNode);
                                            this.traverse(cloneNode)
                                        })
                                        let {firstChild,lastChild}=container
                                        if(firstChild===lastChild){
                                            node.nextNode=firstChild
                                        }else{
                                            node.nextNode=[firstChild,lastChild]
                                        }
                                        // 清除原内容
                                        range.deleteContents()
                                        range.insertNode(container)
                                        container=null
                                        isBreak=true//结束子集遍历
                                        isInit=true
                                    }else {
                                        throw new Error('v-for required Type is Array')
                                    }
                                }
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
                            currentHandle=()=>{}
                        }
                    },
                    {
                        reg:/^v-if$/,
                        handle:(match)=>{
                            let isInit=false
                            let traverserChildren;
                            let range=document.createRange()
                            range.setStartBefore(node)
                            range.setEndAfter(node)
                            currentHandle=()=>{
                                if(keyToVal(this,attr.value.trim(),node)){
                                    range.insertNode(node)
                                    if(!isInit){
                                        isInit=true;
                                        traverserChildren&&traverserChildren();//内部存在v-for且之前并未渲染
                                    }
                                }else{
                                    if(!isInit){//v-if 初始状态为false
                                        traverserChildren=()=>{
                                            next(node);
                                            traverserChildren=null;
                                        }
                                    }
                                    isBreak=true
                                    range.deleteContents()
                                }
                            }
                        }
                    },
                    {
                        reg:/^v-show$/,
                        handle:(match)=>{
                            currentHandle=()=>{
                                node.style.display=keyToVal(this,attr.value.trim(),node)?'':'none';
                            }
                        }
                    },
                    {
                        reg:/^v-bind$/,
                        handle:(match)=>{
                            currentHandle=()=>{
                                node.textContent=keyToVal(this,attr.value.trim(),node);
                            }
                        }
                    },
                    {
                        reg:/^v-model$/,
                        handle:(match)=>{
                            node.value=this[attr.value.trim()]
                            node.addEventListener('input',()=>{this[attr.value.trim()]=node.value});
                            currentHandle=()=>{}
                        }
                    },
                    {
                        reg:/^v-(\w+)/,
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
                            currentHandle=()=>{}
                        }
                    },
                    {
                        reg:/^:([\S\s]+)/,
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
                                                if(keyToVal(this,v.value.name,node)){
                                                    node.classList.add(k)
                                                }else{
                                                    node.classList.remove(k)
                                                }
                                            }
                                            currentHandle()//需要立即执行
                                        })
                                    }catch (e) {

                                    }
                                    currentHandle=null
                                    break;
                                case 'style':
                                    var ast = acorn.parse("(" + expression + ")");
                                    try{
                                        ast.body[0].expression.properties.forEach(v=>{
                                            let k=v.key.name
                                            currentHandle=()=>{
                                                if(/_/.test(k)){
                                                    node.style.setProperty(k,keyToVal(this,v.value.name,node))
                                                }else{
                                                    node.style[k]=keyToVal(this,v.value.name,node)
                                                }
                                            }
                                            currentHandle()//需要立即执行
                                        })
                                    }catch (e) {

                                    }
                                    currentHandle=null
                                    break;
                                default:
                                    attrName=attrName.trim()
                                    if(attrName){
                                        currentHandle=()=>{
                                            node.setAttribute(attrName,keyToVal(this,expression,node))
                                        }
                                    }
                            }
                        }
                    }
                ]
                oneRegHandles.some(v=>{
                    let match=attr.name.match(v.reg);
                    if(match){
                        v.handle(match);
                        exeHandler()
                    }
                    return match
                })
            }
        }
        if(!isBreak)next(node);

    }
}
