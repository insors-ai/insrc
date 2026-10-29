package ai.insors.insrc.jetbrains.connections

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.JBColor
import com.intellij.ui.components.*
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.*
import java.util.concurrent.atomic.AtomicBoolean
import javax.accessibility.AccessibleContext
import javax.swing.*

/** Native immediate-action manager. No browser, Settings model, Apply/reset writes or persistent UI state. */
class ConnectionsManagerPanel(private val project:Project,private val closeView:(()->Unit)?=null):JPanel(BorderLayout(JBUI.scale(8),JBUI.scale(8))),Disposable {
    private val gateway=project.service<ConnectionsSessionService>().manager()
    private val disposed=AtomicBoolean();private val queued=AtomicBoolean()
    private var updating=false;private var suspended=false;private var renderedGeneration=-1L;private var lastForm=-1L
    private val root=JComboBox<String>();private val search=JBTextField(20)
    private val id=JBTextField(24);private val kind=JComboBox<ConnectionDriverChoice>();private val scope=JComboBox(arrayOf("saved","temporary"))
    private val rows=DefaultListModel<SafeConnection>();private val list=JBList(rows)
    private val status=plainLabel("");private val count=plainLabel("");private val error=plainLabel("");private val notice=paragraph("")
    private val title=plainLabel("Connection draft");private val family=plainLabel("");private val guidance=paragraph("");private val lifetime=paragraph("");private val testStatus=plainLabel("")
    private val editor=column();private val operations=column();private val fields=ConnectionFieldsPanel(gateway)
    private val prompt=column();private val promptTitle=plainLabel("");private val promptBody=paragraph("")
    private val noSelection=plainLabel("Select a connection to edit, or add a saved or temporary registration.")
    private val filterButtons=linkedMapOf<String,JToggleButton>()
    private val save=button("save","Save connection"){gateway.save()}
    private val test=button("test","Test (optional)"){gateway.test()}
    private val cancelTest=button("cancel-test","Cancel test"){gateway.cancelTest()}
    private val remove=button("remove","Delete selected"){gateway.remove()}
    private val add=button("add","Add connection"){gateway.add()}
    private val refresh=button("refresh","Refresh"){gateway.refresh()}
    private val clearFilter=button("clear-filter","Clear filters"){gateway.clearFilter()}
    private val close=button("close","Close manager"){gateway.requestClose{closeView?.invoke()?:dispose()}}
    private val cancel=button("confirm-cancel","Cancel"){if(gateway.snapshot().dirty)gateway.decideDirty("cancel")else gateway.decideRemoval("cancel")}
    private val confirm=button("confirm-accept","Confirm"){if(gateway.snapshot().dirty)gateway.decideDirty("discard")else gateway.decideRemoval("confirm")}
    private val attachment:AutoCloseable
    private val subscription:AutoCloseable
    init {
        check(SwingUtilities.isEventDispatchThread());border=JBUI.Borders.empty(12)
        plainCombo(root,{if(it.isEmpty())"Select a registered repository"else it});root.name="root"
        plainCombo(kind,{it.kind+" · "+it.family+if(it.enabled)""else" · requires newer editor"},{it.enabled});kind.name="kind"
        plainCombo(scope,{if(it=="saved")"Saved"else"Temporary"});scope.name="scope";id.name="id";search.name="search"
        val head=column();val heading=JPanel(BorderLayout());heading.add(plainLabel("Connections").apply{font=font.deriveFont(Font.BOLD,font.size2D+4)},BorderLayout.WEST);heading.add(close,BorderLayout.EAST);head.add(heading)
        head.add(error);head.add(notice);labelled(head,"Registered repository",root);add(head,BorderLayout.NORTH)
        val left=column();left.border=JBUI.Borders.emptyRight(8);left.add(plainLabel("Connection registrations"))
        val filters=JPanel(FlowLayout(FlowLayout.LEFT,0,0));for(value in listOf("all","saved","temporary")){val toggle=JToggleButton(value.replaceFirstChar{it.uppercase()}).apply{name="filter-$value";addActionListener{action{gateway.filter(value)}}};filterButtons[value]=toggle;filters.add(toggle)};left.add(filters)
        labelled(left,"Search by ID, driver or label",search);left.add(JPanel(FlowLayout(FlowLayout.LEFT)).apply{add(refresh);add(add);add(clearFilter)});left.add(count);left.add(status)
        list.name="rows";list.selectionMode=ListSelectionModel.SINGLE_SELECTION;list.cellRenderer=object:DefaultListCellRenderer(){override fun getListCellRendererComponent(parent:JList<*>?,value:Any?,index:Int,selected:Boolean,focus:Boolean):Component {
            val cell=super.getListCellRendererComponent(parent,"",index,selected,focus) as JLabel;cell.putClientProperty("html.disable",true)
            (value as? SafeConnection)?.let{cell.text="${it.label?:it.key.id} · ${it.kind} · ${it.key.scope}"};return cell}}
        left.add(JBScrollPane(list).apply{preferredSize=JBUI.size(280,280);minimumSize=JBUI.size(120,90)});left.add(remove)
        val right=column();right.add(operations);right.add(noSelection);editor.add(title);labelled(editor,"Connection ID *",id);labelled(editor,"Driver",kind);labelled(editor,"Connection scope",scope)
        editor.add(family);editor.add(lifetime);editor.add(guidance);editor.add(fields);editor.add(JPanel(FlowLayout(FlowLayout.LEFT)).apply{add(test);add(cancelTest);add(save)});editor.add(testStatus);right.add(editor)
        val split=JSplitPane(JSplitPane.HORIZONTAL_SPLIT,JBScrollPane(left),JBScrollPane(right)).apply{resizeWeight=.36;dividerLocation=JBUI.scale(300);border=JBUI.Borders.empty()}
        add(split,BorderLayout.CENTER);addComponentListener(object:ComponentAdapter(){override fun componentResized(e:ComponentEvent){split.orientation=if(width<JBUI.scale(760))JSplitPane.VERTICAL_SPLIT else JSplitPane.HORIZONTAL_SPLIT}})
        prompt.border=JBUI.Borders.customLine(JBColor.namedColor("Component.borderColor",JBColor.GRAY));prompt.add(promptTitle);prompt.add(promptBody);prompt.add(JPanel(FlowLayout(FlowLayout.RIGHT)).apply{add(cancel);add(confirm)});prompt.isVisible=false;add(prompt,BorderLayout.SOUTH)
        status.accessibleContext.accessibleName="Connection list status";error.accessibleContext.accessibleName="Connection error";testStatus.accessibleContext.accessibleName="Connection test status"
        root.addActionListener{action{val value=root.selectedItem as? String;if(!value.isNullOrEmpty())gateway.root(value)}}
        kind.addActionListener{action{val value=kind.selectedItem as? ConnectionDriverChoice;if(value?.enabled==true)gateway.kind(value.kind)else schedule()}}
        scope.addActionListener{action{gateway.scope(scope.selectedItem as String)}}
        observe(id){action{gateway.id(id.text)}}
        search.addActionListener{action{gateway.search(search.text)}};search.addFocusListener(object:FocusAdapter(){override fun focusLost(e:FocusEvent){action{gateway.search(search.text)}}})
        list.addListSelectionListener{event->if(!event.valueIsAdjusting)action{list.selectedValue?.let{gateway.select(it.key,it.revision)}}}
        addHierarchyListener{event->if(event.changeFlags and HierarchyEvent.SHOWING_CHANGED.toLong()!=0L&&!disposed.get()){suspended=!isShowing;if(isShowing){fields.resumeView();gateway.resumeView()}else{fields.suspendView();gateway.suspendView()}}}
        subscription=gateway.onChange{schedule()};attachment=gateway.attach();Disposer.register(project,this);schedule()
    }
    private fun paragraph(value:String)=JTextArea(value).apply{isEditable=false;lineWrap=true;wrapStyleWord=true;isOpaque=false;border=JBUI.Borders.empty(4,0);rows=2;columns=20}
    private fun labelled(parent:JPanel,text:String,input:JComponent){val line=JPanel(BorderLayout(JBUI.scale(8),0)).apply{alignmentX=Component.LEFT_ALIGNMENT;border=JBUI.Borders.empty(4,0)};line.add(plainLabel(text).apply{labelFor=input},BorderLayout.WEST);line.add(input,BorderLayout.CENTER);parent.add(line)}
    private fun button(name:String,text:String,body:()->Unit)=JButton(text).apply{this.name=name;addActionListener{action(body)}}
    private fun action(body:()->Unit){if(!updating&&!suspended&&!disposed.get()&&!project.isDisposed&&renderedGeneration==gateway.snapshot().generation)body()}
    private fun schedule(){if(disposed.get()||project.isDisposed||!queued.compareAndSet(false,true))return
        ApplicationManager.getApplication().invokeLater({queued.set(false);if(disposed.get()||project.isDisposed)return@invokeLater
            val version=gateway.generation;val view=gateway.snapshot();if(version!=gateway.generation){schedule();return@invokeLater};render(view)
        },ModalityState.any())}
    private fun announce(label:JLabel,value:String){if(label.text==value)return;val before=label.text;label.text=value;label.accessibleContext.firePropertyChange(AccessibleContext.ACCESSIBLE_VISIBLE_DATA_PROPERTY,before,value)}
    internal fun render(view:ConnectionsManagerView){check(SwingUtilities.isEventDispatchThread());if(disposed.get()||project.isDisposed)return;updating=true
        try {
            renderedGeneration=view.generation
            val roots=listOf("")+view.list.roots;if((0 until root.itemCount).map{root.getItemAt(it)}!=roots){root.model=DefaultComboBoxModel(roots.toTypedArray())};root.selectedItem=view.list.repoRoot?:""
            if(!search.hasFocus()||view.error.isNotEmpty())search.text=view.list.search
            val counts=view.list.counts;for((scope,control)in filterButtons){val n=when(scope){"saved"->counts.saved;"temporary"->counts.temporary;else->counts.all};control.text="${scope.replaceFirstChar{it.uppercase()}} ($n)";control.isSelected=view.list.filter==scope}
            count.text="${view.list.matchingCount} matching · ${counts.all} total${if(view.list.stale)" · stale"else""}"
            announce(status,when(view.list.listState){"loading"->"Loading connections…";"ready"->"Connections ready.";"empty-registry"->"No connections in this repository. Add a saved or temporary registration.";"empty-filter"->"No connections match this filter and search.";"read-error"->"Connections could not be read. Last known rows are stale and cannot be changed.";"offline"->"Daemon offline or owner expired. Last known rows are stale and cannot be changed.";"upgrade-required"->"Connection management requires a compatible daemon and enabled support.";else->"Select a daemon-registered repository. Register one through insrc if none are listed."})
            announce(error,view.error);notice.text=view.notice;clearFilter.isVisible=view.list.listState=="empty-filter"
            val visible=view.list.rows.filter{it.key in view.list.visibleKeys};val same=rows.size()==visible.size&&visible.indices.all{rows[it].key==visible[it].key&&rows[it].revision==visible[it].revision&&rows[it].label==visible[it].label}
            if(!same){rows.clear();visible.forEach{rows.addElement(it)}};list.selectedIndex=visible.indexOfFirst{it.key==view.list.selected?.key&&it.revision==view.list.selected.revision};list.isEnabled=view.list.canMutate
            val prompted=view.dirty||view.confirmation!=null
            val form=view.draft;editor.isVisible=form!=null;noSelection.isVisible=form==null;operations.removeAll()
            for(record in view.operations){val card=column().apply{border=JBUI.Borders.empty(8)};card.add(plainLabel("${record.key.id} · ${record.key.scope}"));card.add(paragraph(record.removal?.safeMessage?:if(record.phase=="committed")"Registration committed: ${record.outcome?.registration}."else"Operation ${record.phase.replace('-',' ')}."))
                val problem=when(record.errorCode){"duplicate-id"->"A connection with this ID already exists. Choose a different ID.";"busy"->"The connection is in use. Retry after current work finishes.";"conflict"->"The stored revision changed. Refresh and reopen it before trying again.";"registry-unreadable"->"The registration store could not be read safely. Repair it before retrying.";"secret-unavailable"->"Stored credentials are unavailable. Re-enter them explicitly.";"session-expired"->"The temporary owner ended. Its private input has been erased.";"upgrade-required"->"Upgrade or enable compatible connection management before continuing.";"transport-error"->"Delivery was lost. Check the original operation; do not create a replacement request.";"reconciliation-required"->"Reconcile the original operation before making a new attempt.";else->null};problem?.let{card.add(paragraph(it))}
                record.outcome?.let{card.add(plainLabel("Activation: ${it.activation} · Credential cleanup: ${it.credentialCleanup} · List refresh: ${record.refresh}"))};record.removal?.resourceCleanup?.let{card.add(plainLabel("Resource cleanup: $it"))}
                val actions=JPanel(FlowLayout(FlowLayout.LEFT));fun op(text:String,action:String){actions.add(button("operation:${record.recordId}:$action",text){gateway.operation(record.recordId,action)}.apply{isEnabled=!record.busy&&!prompted})}
                if(record.phase in setOf("unknown","pending","not-seen","reconciliation-required"))op("Check original operation","reconcile");if(record.canReplay)op("Replay identical original request","replay")
                if(record.phase=="committed"){if(record.outcome?.activation in setOf("pending","failed"))op("Retry activation","activation");if(record.outcome?.credentialCleanup=="pending"||record.removal?.state=="removed-cleanup-pending")op("Retry original cleanup","cleanup");if(record.refresh=="failed")op("Retry list refresh","refresh")};if(record.canDismiss)op("Dismiss completed card","dismiss");card.add(actions);operations.add(card)
            }
            if(form!=null){val locked=view.blocked||form.readOnly||!view.list.canMutate||prompted;title.text=if(form.mode=="create")"Add connection"else"Edit connection"
                if(!id.hasFocus()||view.error.isNotEmpty())id.text=form.key.id;id.isEnabled=form.mode=="create"&&!locked
                if((0 until kind.itemCount).map{kind.getItemAt(it)}!=view.choices)kind.model=DefaultComboBoxModel(view.choices.toTypedArray());kind.selectedItem=view.choices.firstOrNull{it.kind==form.kind};kind.isEnabled=form.mode=="create"&&!locked
                scope.selectedItem=form.key.scope;scope.isEnabled=form.mode=="create"&&!locked;family.text="Effective family: ${form.family}"
                lifetime.text=if(form.key.scope=="temporary")"Temporary connections survive repository, manager and Settings switches. They expire when this Project ends, its lease expires, or the daemon restarts. Discard releases application-owned resources and preserves source data."else"Saved registrations persist for this repository. Delete removes the registration and obsolete application-owned credentials; source data is preserved."
                guidance.text=if(view.blocked)"Resolve the pending operation before editing this connection."else form.guidance?:if(!view.valid)"Complete required fields (*) and replacement values to save."else"Test is optional. Save uses exactly the same input."
                fields.render(view.copy(blocked=view.blocked||prompted));save.isEnabled=view.valid&&!locked;test.isEnabled=save.isEnabled&&view.test.status!="testing";cancelTest.isVisible=view.test.status=="testing"
                announce(testStatus,view.test.message+(view.test.tookMs?.let{" (${it.toLong()} ms)"}?:"")+(if(view.test.cleanupUnverified)" Worker cleanup is not yet verified."else""))
                if(lastForm!=view.formId){lastForm=view.formId;if(form.mode=="create")id.requestFocusInWindow()}
            }else{fields.render(view);lastForm=-1}
            add.isEnabled=view.list.canMutate&&view.choices.any{it.enabled};remove.isEnabled=view.list.canMutate&&list.selectedValue!=null;remove.text=if(list.selectedValue?.key?.scope=="temporary")"Discard selected"else"Delete selected"
            val confirmation=view.confirmation;val showing=view.dirty||confirmation!=null;val was=prompt.isVisible;prompt.isVisible=showing
            if(showing){promptTitle.text=if(view.dirty)"Discard unsaved changes?"else"${confirmation!!.action} connection?";promptBody.text=if(view.dirty)"Discard clears only this unsaved draft. Cancel keeps every field and returns to editing."else"${confirmation!!.message}\n${confirmation.key.repoRoot} · ${confirmation.key.scope} · ${confirmation.key.id} · revision ${confirmation.expectedRevision}";confirm.text=if(view.dirty)"Discard unsaved draft"else confirmation!!.action;if(!was)cancel.requestFocusInWindow()
                root.isEnabled=false;list.isEnabled=false;search.isEnabled=false;filterButtons.values.forEach{it.isEnabled=false};for(component in listOf(save,test,remove,add,refresh,clearFilter,close))component.isEnabled=false
            }else{root.isEnabled=true;search.isEnabled=true;filterButtons.values.forEach{it.isEnabled=true};refresh.isEnabled=true;close.isEnabled=true}
        }finally{updating=false;revalidate();repaint()}
    }
    override fun dispose(){if(!disposed.compareAndSet(false,true))return;subscription.close();attachment.close()
        val erase=Runnable{updating=true;try{fields.clearView();rows.clear();id.text="";search.text="";root.removeAllItems();kind.removeAllItems();operations.removeAll();removeAll();isVisible=false}finally{updating=false}};if(SwingUtilities.isEventDispatchThread())erase.run()else ApplicationManager.getApplication().invokeLater(erase,ModalityState.any())
    }
}
