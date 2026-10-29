package ai.insors.insrc.jetbrains.connections

import com.google.gson.*
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import java.awt.*
import javax.swing.*
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

internal fun plainLabel(text:String)=JBLabel().apply{putClientProperty("html.disable",true);this.text=text}
internal fun column()=JPanel().apply{layout=BoxLayout(this,BoxLayout.Y_AXIS);alignmentX=Component.LEFT_ALIGNMENT}
internal fun observe(field:JTextField,changed:()->Unit){field.document.addDocumentListener(object:DocumentListener{
    override fun insertUpdate(e:DocumentEvent)=changed()
    override fun removeUpdate(e:DocumentEvent)=changed()
    override fun changedUpdate(e:DocumentEvent)=changed()
})}
private data class FieldChoice(val label:String,val value:JsonElement?){override fun toString()=label}
internal fun <T> plainCombo(combo:JComboBox<T>,label:(T)->String,enabled:(T)->Boolean={true}) {
    combo.renderer=object:DefaultListCellRenderer(){override fun getListCellRendererComponent(list:JList<*>?,value:Any?,index:Int,selected:Boolean,focus:Boolean):Component {
        val cell=super.getListCellRendererComponent(list,"",index,selected,focus) as JLabel;cell.putClientProperty("html.disable",true)
        if(value!=null){@Suppress("UNCHECKED_CAST") val typed=value as T;cell.text=label(typed);cell.isEnabled=enabled(typed)};return cell
    }}
}

/** Typed advertised schemas only. Replacement values live in password documents, never in render snapshots. */
internal class ConnectionFieldsPanel(private val gateway:ConnectionsManagerGateway):JPanel(BorderLayout()) {
    private data class Binding(val component:JComponent,val path:List<String>,val update:(JsonElement?)->Unit)
    private data class Secret(val action:JComboBox<String>,val entry:JPanel,val fields:MutableList<JBPasswordField>)
    private val fieldBody=column();private val secrets=column();private val bindings=mutableListOf<Binding>();private val secretBindings=linkedMapOf<String,Secret>()
    private val buttons=mutableListOf<Pair<JButton,()->Boolean>>()
    private var latest:ConnectionsManagerView?=null;private var formId=-1L;private var shape="";private var updating=false;private var active=true
    init{val content=column();content.add(fieldBody);content.add(secrets);add(content,BorderLayout.NORTH)}
    private fun accepting(component:JComponent?=null)=active&&!updating&&latest?.generation==gateway.snapshot().generation&&(component==null||SwingUtilities.isDescendingFrom(component,this))
    private fun human(s:String)=s.replace(Regex("([a-z])([A-Z])"),"$1 $2").replace(Regex("[-_.]")," ").replaceFirstChar{it.uppercase()}
    private fun name(path:List<String>)=path.lastOrNull()?.let{it.toIntOrNull()?.let{n->"Item ${n+1}"}?:human(it)}?:"Connection fields"
    private fun at(value:JsonElement?,path:List<String>):JsonElement? {var current=value
        for(part in path)current=if(current?.isJsonObject==true)current.asJsonObject[part]else if(current?.isJsonArray==true)part.toIntOrNull()?.let{index->val array=current!!.asJsonArray;if(index in 0 until array.size())array[index]else null}else null
        return current}
    private fun branch(s:JsonObject,v:JsonElement?):Int {val choices=s.getAsJsonArray("anyOf")
        return choices.indexOfFirst{c->val o=c.asJsonObject;if(o.has("const"))o["const"]==v else when(o["type"]?.asString){"string"->v?.isJsonPrimitive==true&&v.asJsonPrimitive.isString;"number","integer"->v?.isJsonPrimitive==true&&v.asJsonPrimitive.isNumber;"boolean"->v?.isJsonPrimitive==true&&v.asJsonPrimitive.isBoolean;"object"->v?.isJsonObject==true;"array"->v?.isJsonArray==true;else->false}}.takeIf{it>=0}?:0}
    private fun structure(s:JsonObject,v:JsonElement?):String=when {
        s.has("anyOf")->branch(s,v).let{"$it:${structure(s.getAsJsonArray("anyOf")[it].asJsonObject,v)}"}
        s["type"]?.asString=="object"->s.getAsJsonObject("properties").entrySet().joinToString{(k,c)->"$k:${structure(c.asJsonObject,v?.takeIf{it.isJsonObject}?.asJsonObject?.get(k))}"}
        s["type"]?.asString=="array"->v?.takeIf{it.isJsonArray}?.asJsonArray?.joinToString{structure(s.getAsJsonObject("items"),it)}?:""
        else->""
    }
    private fun sample(s:JsonObject):JsonElement=when {
        s.has("const")->s["const"].deepCopy();s.has("enum")->s.getAsJsonArray("enum")[0].deepCopy()
        s["type"]?.asString=="object"->JsonObject();s["type"]?.asString=="array"->JsonArray()
        s["type"]?.asString=="boolean"->JsonPrimitive(false);s["type"]?.asString in setOf("number","integer")->s["minimum"]?.deepCopy()?:JsonPrimitive(0)
        else->JsonPrimitive("")
    }
    private fun row(parent:JPanel,label:String,input:JComponent):JPanel {val row=JPanel(BorderLayout(JBUI.scale(8),0)).apply{alignmentX=Component.LEFT_ALIGNMENT;border=JBUI.Borders.empty(3,0)}
        row.add(plainLabel(label).apply{labelFor=input},BorderLayout.WEST);row.add(input,BorderLayout.CENTER);parent.add(row);return row}
    private fun action(parent:JPanel,label:String,allowed:()->Boolean={true},run:()->Unit):JButton=JButton(label).also{b->b.addActionListener{if(accepting(b))run()};buttons.add(b to allowed);parent.add(b)}
    private fun reset(parent:JPanel,path:List<String>){if(path.none{it.toIntOrNull()!=null})action(parent,if(latest?.draft?.mode=="update")"Keep original"else"Use default"){gateway.reset(path)}}
    private fun build(schema:JsonObject,path:List<String>,parent:JPanel,required:Boolean){
        if(schema.has("const"))return
        val current=at(latest?.draft?.publicValues,path);val key=path.joinToString(".")
        if(schema.has("anyOf")){val group=column().apply{border=BorderFactory.createTitledBorder(name(path))};val options=schema.getAsJsonArray("anyOf")
            val combo=JComboBox(options.mapIndexed{index,v->val s=v.asJsonObject;FieldChoice(if(s.has("const"))"Fixed value: ${s["const"]}"else human(s["type"].asString),JsonPrimitive(index))}.toTypedArray())
            plainCombo(combo,{it.label});combo.name="format:$key";combo.selectedIndex=branch(schema,current);combo.addActionListener{if(accepting(combo))gateway.field(path,sample(options[combo.selectedIndex].asJsonObject))};row(group,"${name(path)} format",combo)
            bindings.add(Binding(combo,path){value->combo.selectedIndex=branch(schema,value)});build(options[combo.selectedIndex].asJsonObject,path,group,required);parent.add(group);return
        }
        when(schema["type"]?.asString){
            "object"->{val group=column().apply{border=BorderFactory.createTitledBorder(name(path)+(if(path.isNotEmpty()&&!required)" (optional)"else""))}
                val must=schema["required"]?.asJsonArray?.map{it.asString}?:emptyList()
                schema.getAsJsonObject("properties").entrySet().filter{it.key!="kind"}.forEach{(k,v)->build(v.asJsonObject,path+k,group,k in must)};parent.add(group);return}
            "array"->{val group=column().apply{border=BorderFactory.createTitledBorder(name(path)+(if(required)" *"else""))};val array=current?.takeIf{it.isJsonArray}?.asJsonArray?:JsonArray()
                array.forEachIndexed{index,_->val item=column();build(schema.getAsJsonObject("items"),path+index.toString(),item,true);action(item,"Remove item ${index+1}"){gateway.field(path,JsonArray().apply{array.forEachIndexed{i,value->if(i!=index)add(value.deepCopy())}})};group.add(item)}
                action(group,"Add ${name(path).lowercase()} item",{array.size()<(schema["maxItems"]?.asInt?:16384)}){gateway.field(path,array.deepCopy().apply{add(sample(schema.getAsJsonObject("items")))})};reset(group,path);parent.add(group);return}
        }
        val type=schema["type"]?.asString;val input:JComponent
        if(schema.has("enum")||type=="boolean"){
            val values=schema["enum"]?.asJsonArray?.toList()?:listOf(JsonPrimitive(true),JsonPrimitive(false))
            val options=(if(path.none{it.toIntOrNull()!=null})listOf(FieldChoice(if(latest?.draft?.mode=="update")"Keep original"else"Use default",null))else emptyList())+values.map{FieldChoice(if(it.isJsonPrimitive&&it.asJsonPrimitive.isString)it.asString else it.toString(),it)}
            val combo=JComboBox(options.toTypedArray());plainCombo(combo,{it.label});combo.addActionListener{if(accepting(combo)){val v=(combo.selectedItem as? FieldChoice)?.value;if(v==null)gateway.reset(path)else gateway.field(path,v.deepCopy())}}
            bindings.add(Binding(combo,path){v->combo.selectedIndex=options.indexOfFirst{it.value==v}.takeIf{it>=0}?:0});input=combo
        }else{
            val field=JBTextField(24);field.name="field:$key";observe(field){if(accepting(field)){val text=field.text
                if(type in setOf("number","integer")){if(text.isEmpty())gateway.reset(path)else{val n=text.toDoubleOrNull();gateway.field(path,if(n!=null&&n.isFinite())JsonPrimitive(n)else JsonPrimitive(text))}}
                else gateway.field(path,JsonPrimitive(text))}}
            bindings.add(Binding(field,path){v->val value=if(v==null)""else if(v.isJsonPrimitive&&v.asJsonPrimitive.isString)v.asString else v.toString();if((!field.hasFocus()||latest?.error?.isNotEmpty()==true)&&field.text!=value)field.text=value});input=field
        }
        input.name="field:$key";val line=row(parent,name(path)+(if(required)" *"else""),input);val controls=JPanel(FlowLayout(FlowLayout.LEFT,0,0));reset(controls,path);line.add(controls,BorderLayout.EAST)
    }
    private fun buildSecrets(view:ConnectionDraftView){erase();secrets.removeAll();secretBindings.clear()
        for(slot in view.credentials){val group=column().apply{border=BorderFactory.createTitledBorder(human(slot.slot))};group.add(plainLabel(if(slot.present)"Stored value present."else"No stored value."))
            val choice=JComboBox(arrayOf("keep","replace","clear"));plainCombo(choice,{human(it)});choice.name="credential-action:${slot.slot}";row(group,"Credential action",choice)
            val entry=column();group.add(entry);val inputs=mutableListOf<JBPasswordField>()
            fun changed(){if(!accepting(group))return
                val arrays=inputs.map{it.password};try{val values=arrays.map{String(it)}
                    if(slot.format=="address-list"){if(values.any{it.isEmpty()})gateway.credential(slot.slot,"replace","")else gateway.addresses(slot.slot,values)}else gateway.credential(slot.slot,"replace",values.firstOrNull()?:"")
                }finally{arrays.forEach{it.fill('\u0000')}}}
            fun addInput(){val field=JBPasswordField();field.columns=24;field.name="credential:${slot.slot}:${inputs.size}";val line=row(entry,if(slot.format=="address-list")"Replacement address"else"Replacement value",field);inputs.add(field);observe(field){if(accepting(field))changed()}
                if(slot.format=="address-list"){val controls=JPanel();action(controls,"Remove replacement address"){val previous=updating;updating=true;try{field.text=""}finally{updating=previous};inputs.remove(field);entry.remove(line);if(inputs.isEmpty()){addInput();gateway.credential(slot.slot,"replace","")}else changed();entry.revalidate();entry.repaint()};line.add(controls,BorderLayout.EAST)}}
            addInput();if(slot.format=="address-list")action(entry,"Add replacement address"){addInput();changed();inputs.last().requestFocusInWindow();entry.revalidate()}
            choice.addActionListener{if(accepting()){updating=true;inputs.forEach{it.text=""};updating=false;val action=choice.selectedItem as String;gateway.credential(slot.slot,action,if(action=="replace")""else null)}}
            group.add(plainLabel("Replace starts blank. Entered values stay only in Project memory and are never echoed back."));secrets.add(group);secretBindings[slot.slot]=Secret(choice,entry,inputs)
        }
    }
    fun render(view:ConnectionsManagerView){check(SwingUtilities.isEventDispatchThread());latest=view;val form=view.draft
        updating=true
        try {
            if(form==null){erase();fieldBody.removeAll();secrets.removeAll();bindings.clear();secretBindings.clear();buttons.clear();formId=-1;shape="";return}
            if(formId!=view.formId){fieldBody.removeAll();bindings.clear();buttons.clear();shape="";formId=view.formId;buildSecrets(form)}
            val next=structure(form.publicInputSchema,form.publicValues)
            if(shape!=next||fieldBody.componentCount==0){val focus=KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner?.name;buttons.removeAll{SwingUtilities.isDescendingFrom(it.first,fieldBody)};fieldBody.removeAll();bindings.clear();shape=next;build(form.publicInputSchema,emptyList(),fieldBody,false);if(focus!=null)bindings.firstOrNull{it.component.name==focus}?.component?.requestFocusInWindow()}
            val locked=view.blocked||form.readOnly||!view.list.canMutate
            for(binding in bindings){binding.update(at(form.publicValues,binding.path));binding.component.isEnabled=!locked}
            buttons.forEach{(button,allowed)->button.isEnabled=!locked&&allowed()}
            for(slot in form.credentials){val widgets=secretBindings[slot.slot]?:continue;widgets.action.selectedItem=slot.action;widgets.action.isEnabled=!locked;widgets.entry.isVisible=slot.action=="replace";widgets.fields.forEach{if(slot.action!="replace"&&it.document.length>0)it.text="";it.isEnabled=!locked}}
        }finally{updating=false;revalidate();repaint()}
    }
    fun erase(){val previous=updating;updating=true;try{secretBindings.values.flatMap{it.fields}.forEach{it.text=""}}finally{updating=previous}}
    fun suspendView(){active=false;erase()}
    fun resumeView(){active=true}
    fun clearView(){updating=true;try{secretBindings.values.flatMap{it.fields}.forEach{it.text=""};secretBindings.clear();bindings.clear();buttons.clear();fieldBody.removeAll();secrets.removeAll();latest=null;formId=-1;shape=""}finally{updating=false}}
}
