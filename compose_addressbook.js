var compose_addressbook_fetched = false;

if(window.rcmail) {
  rcmail.addEventListener('init', function(evt) {

    // mode of operation. configure this in config.php
    var mode = rcmail.env.compose_addressbook_mode;
    
    // to be able to have translated buttons, we need to predefine the buttons array
    var cab_to  = rcmail.gettext('to');
    var cab_cc  = rcmail.gettext('cc');
    var cab_bcc = rcmail.gettext('bcc');
    
    var buttons = {};
    buttons[cab_bcc] = function() {
      compose_addressbook_add_recipients('_bcc');
      $('.ui-dialog-buttonpane button').removeClass('ui-state-focus');
    }
    buttons[cab_cc] = function() {
      compose_addressbook_add_recipients('_cc');
      $('.ui-dialog-buttonpane button').removeClass('ui-state-focus');    
    }
    buttons[cab_to] = function() {
      compose_addressbook_add_recipients('_to');
      $('.ui-dialog-buttonpane button').removeClass('ui-state-focus');
    }
    
    // bind the dialog functionality to the dialog div
    $("#compose_addressbook_dialog").dialog({
      autoOpen: false,
      modal: false,
      resizable: false,
      width: 285,
      height: 500,
      minHeight: 400,
      buttons: buttons,
      position: [$(window).width()-400,50]
    });
    
    // register the command associated with the toolbar button
    rcmail.register_command('plugin.compose_addressbook', compose_addressbook_start , true);
    
    // add the command to the list of compose commands
    rcmail.env.compose_commands.push('plugin.compose_addressbook');

    // register the callback function 
    rcmail.addEventListener('plugin.compose_addressbook_receive', compose_addressbook_receive);
    
    // register the callback function for the group expander
    rcmail.addEventListener('plugin.compose_addressbook_receive_expand', compose_addressbook_receive_expand);
    
    // create an rc list object 
    if(rcmail.gui_objects.compose_addressbook_list) {
      rcmail.compose_addressbook_list = new rcube_list_widget(rcmail.gui_objects.compose_addressbook_list, {multiselect:true, draggable:false, keyboard:false});
      
      // add a listener for double click
      rcmail.compose_addressbook_list.addEventListener('dblclick', function(o){ compose_address_dblclick(o); });
      
      // initialize the list
      rcmail.compose_addressbook_list.init();  
    }  
    
    // each mode of operation has a different key handler
    if(mode == 'full') {
      // bind keyevent handler to the search box
      $('#compose_addressbook_filter').bind('keyup', function(evt) {
        var search = $('#compose_addressbook_filter').val();
        var regexp = new RegExp(search, 'i');
        $('#compose_addressbook_table').find('td').each(function() {
          var content = $(this).attr('title');
          if(regexp.test(content)) {
            $(this).parent().show();
          } else {
            $(this).parent().hide();
          }
        });
      });
    } else {
      $('#compose_addressbook_filter').bind((bw.safari || bw.ie ? 'keydown' : 'keypress'), function(evt) {
        var key = rcube_event.get_keycode(evt);
        if(key == 13) {
          var search = $('#compose_addressbook_filter').val();
          $('#compose_addressbook_filter').val('');
          compose_addressbook_search(search);
          return false;
        } 
      });
    }
    
    // bind click event to clear function
    $("#compose_addressbook_searchreset").bind('click', function(e) { 
      $('#compose_addressbook_filter').val('');
      $('#compose_addressbook_filter').focus();
      $('#compose_addressbook_table').find('tr').each(function() {
        $(this).show();
      });
    });
  });
}

function compose_addressbook_start() 
{
  compose_addressbook_fetch();
  $('#compose_addressbook_dialog').dialog('open');
}

function compose_addressbook_fetch() 
{
  if(!compose_addressbook_fetched) {
    lock = rcmail.set_busy(true, 'loading');
    rcmail.http_post('plugin.get_addressbook', '', lock);
    compose_addressbook_fetched = true;
  }
}

function compose_addressbook_search(search) 
{
  rcmail.compose_addressbook_list.clear();
  lock = rcmail.set_busy(true, 'loading');
  rcmail.http_post('plugin.get_addressbook', '_search='+urlencode(search), lock);
}

function compose_addressbook_receive(data) 
{
  var addresses = data.addresses;
  var name;
  var email;
  
  // save the addresses for later use
  rcmail.compose_addressbook_addresses = addresses;

  for(var j=0; j<addresses.length; j++) {
    var name = addresses[j].name;
    
    if(addresses[j].id) {
      email = 'address group';
    } else {
      email = addresses[j].email;
    }
    // add address to the row
    compose_addressbook_add(name,email,j);    
  }
}

function compose_addressbook_add(address,email,id) {
  var row = document.createElement('tr');
  row.id = 'rcmrow'+id;
  td = document.createElement('td');
  td.innerHTML = address;
  td.setAttribute('title', email);
  td.style.cursor='pointer';
  row.appendChild(td);
  
  // add element to the list
  rcmail.compose_addressbook_list.insert_row(row,0);
}

function compose_address_dblclick(list) {
  var group_ids = [];
  var group_sources = [];
  
  var id = list.get_single_selection();
  if(id == null) return;
  
  var uid = list.rows[id].uid;
  if(rcmail.compose_addressbook_addresses[uid].id) {
    group_ids[0] = rcmail.compose_addressbook_addresses[uid].id;
    group_sources[0] = rcmail.compose_addressbook_addresses[uid].source;
    compose_addressbook_expand(group_ids, group_sources, '_to');
  } else {
    $("[name='_to']").attr('value', $("[name='_to']").val() + rcmail.compose_addressbook_addresses[uid].email+", ");
  }
  rcmail.compose_addressbook_list.clear_selection();
}

function compose_addressbook_add_recipients(target) {
  var group_ids = [];
  var group_sources = [];
  
  if(rcmail.compose_addressbook_list.selection.length == 0) {
    rcmail.display_message(rcmail.gettext('compose_addressbook_noselect', 'compose_addressbook'), 'error');
    return;
  }
  rcmail.compose_addressbook_list.focused = false;
  switch(target) {
    case '_cc':
      rcmail_ui.show_header_form('cc');
      break;
    case '_bcc':
      rcmail_ui.show_header_form('bcc');
      break;
  }
  
  for (var n=0; n<rcmail.compose_addressbook_list.selection.length; n++) {
    var id = rcmail.compose_addressbook_list.selection[n];
    var uid = rcmail.compose_addressbook_list.rows[id].uid;
    var form = '[name="'+target+'"]';
    
    if(rcmail.compose_addressbook_addresses[uid].id) {
      group_ids[group_ids.length] = rcmail.compose_addressbook_addresses[uid].id;
      group_sources[group_sources.length] = rcmail.compose_addressbook_addresses[uid].source;
    } else {
      $('#'+target).attr('value', $('#'+target).val() + rcmail.compose_addressbook_addresses[uid].email+", ");
    }
  }
  compose_addressbook_expand(group_ids, group_sources,target);
  rcmail.compose_addressbook_list.clear_selection();  
  rcmail.display_message(rcmail.gettext('compose_addressbook_added', 'compose_addressbook'), 'confirmation');
}

function compose_addressbook_expand(group_ids, group_sources,target) {
  if(group_ids.length > 0) {
    lock = rcmail.set_busy(true, 'loading');
    rcmail.http_request('plugin.expand_groups', '_groupids='+urlencode(group_ids.join(','))+'&_groupsources='+urlencode(group_sources.join(','))+'&_target='+target, lock);
  }
}

function compose_addressbook_receive_expand(data) {
  var form = '[name="'+data.target+'"]';
  
  for(var j in data.members) {
    $(form).attr('value', $(form).val() + data.members[j]+", ");
  }
}
