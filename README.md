# vue-core
vue v-for v-modal {{xx}} 等核心功能实现

## Usage

```js
<script type="module">
    import {Vue} from './vue-core.js'
    new Vue({
        el: '#app',
        data() {
            return {
                isBlue:'',
                bgColor:'#828282',
                color:'red',
                msg: 'hi',
                s: 'andy',
                ss: {val: 0},
                sss: [[0]],
                arr:Object.keys(new Array(3).fill(null))
            }
        },
        methods: {
            classControl(){
                this.isBlue=!this.isBlue
            },
            changeBgColor(){
                if(this.bgColor=='#828282'){
                    this.bgColor='#fff'
                }else{
                    this.bgColor='#828282'
                }
            },
            arrPush(){
                this.arr.push(this.arr.length)
            },
            arrVforRest(){
                this.arr=[0,1,2]
                console.log(this,this.arr)
            },
            reset() {
                this.ss = {val: 0}
            },
            reverse() {
                this.s = this.s.split('').reverse().join('')
            },
            add(el) {
                console.log(el)
                this.ss.val++
            },
            arrAdd() {
                console.log(this)
                this.sss[0][0]++
            },
            arrReset() {
                this.sss[0] = [0]
            }
        },
        directives: {
            focus: {
                // 仅实现bind
                bind(el, binding) {
                    console.log(el, binding);
                    el.focus()
                }
            }
        }
    })
</script>
```

## Demo



