<?php

/**
  * This plugin lets you add addressbook entries from the compose window using the mouse
  * 
  * @author Cor Bosman (roundcube@wa.ter.net)
  */
  
class compose_addressbook extends rcube_plugin
{
  public $task = 'mail';

  public function init()
  {  
    $rcmail = rcmail::get_instance();
    
    // only run this plugin if the skin is set to classic
    $skin = $rcmail->config->get('skin');
    if($skin != 'classic') return;
    
    $this->require_plugin('jqueryui');

    $this->register_action('plugin.get_addressbook', array($this, 'get_address'));
    $this->register_action('plugin.expand_groups', array($this, 'expand_groups'));
    
    if($rcmail->action == 'compose') {      
      $this->compose_addressbook_init();      
    }
  }

  public function compose_addressbook_init()
  {
    $this->add_texts('localization', true);
    
    $rcmail = rcmail::get_instance();
    
    $skin_path = $this->local_skin_path();
    
    // add javascript and stylesheets
    $this->include_script('compose_addressbook.js?v=2');
    $this->include_stylesheet("$skin_path/compose_addressbook.css");
    
    // html for dialog window
    $table = new html_table(array('id' => 'compose_addressbook_table', 'class' => 'records-table', 'cols' => 1, 'cellspacing' => 0));
     
    // create div for dialog window
    $rcmail->output->add_footer(html::div(array('id' => "compose_addressbook_dialog", 'title' => Q($this->gettext('compose_addressbook_title'))),
                                  html::div(array('id' => "compose_addressbook_quicksearchbar"),
                                    html::img(array('id'=>'compose_addressbook_searchmod','src'=>'/images/icons/glass.png')) .
                                    html::tag('input', array('type' => "text", 'class' => 'compose_addressbook_filter','id'=>'compose_addressbook_filter')). 
                                    html::a(array('id' => 'compose_addressbook_searchreset', 'href'=>'#'),
                                      html::img(array('src'=>'/images/icons/reset.gif')))
                                  ) . 
                                  html::div(array('id' => "compose_addressbook_container"),
                                    $table->show()
                                  )
                                ));
                  
    // add the addressbook button
    $this->add_button(array(
      'command' => 'plugin.compose_addressbook', 
      'imagepas' => $skin_path.'/compose_addressbook.png', 
      'imageact' => $skin_path.'/compose_addressbook.png', 
      'title' => 'compose_addressbook.compose_addressbook_buttontitle', 
      'id' => 'rcmbtn_compose_addressbook'), 'toolbar');
    
    $this->load_config();    
    $rcmail->output->set_env('compose_addressbook_mode', $rcmail->config->get('compose_addressbook_mode', 'full'));
    $rcmail->output->add_gui_object('compose_addressbook_list', 'compose_addressbook_table');
    
    // add some labels 
    $rcmail->output->add_label('cc', 'bcc', 'to');
    
    // add list functions
    $rcmail->output->include_script('list.js');
                               
  }
  
  // get the addressbook entries and return them to the UI.
  function get_address() {
    $contacts = array();
    $this->load_config();
    $rcmail = rcmail::get_instance();
    
    $mode = $rcmail->config->get('compose_addressbook_mode', 'full');
    $search_mode = $rcmail->config->get('addressbook_search_mode');
       
    // get the addressbooks, or default to all address sources
    $book_types = (array) $rcmail->config->get('compose_addressbooks', $rcmail->config->get('autocomplete_addressbooks', array_keys($rcmail->get_address_sources())));
        
    foreach ($book_types as $id) {
      $abook = $rcmail->get_address_book($id);
      $abook->set_pagesize(50000);

      if($mode == 'full') {
        $result = $abook->list_records();
        while ($sql_arr = $result->iterate()) {
          foreach ((array)$abook->get_col_values('email', $sql_arr, true) as $email) {
            $contact = format_email_recipient($email, $sql_arr['name']);
            $contacts[] = array('name' => $sql_arr['name'] , 'email' => format_email_recipient($email, $sql_arr['name']));
          }
        }
        $search = null;
        if($abook->groups) {
          foreach($abook->list_groups($search) as $group) {
            $abook->reset();
            $abook->set_group($group['ID']);
            $result = $abook->count();
            if ($result->count) {
              $contacts[] = array('name' => $group['name'] . ' (' . intval($result->count) . ')', 'id' => $group['ID'], 'source' => $id);
            }
          }
        }
      } else {
        $search=trim(get_input_value('_search', RCUBE_INPUT_POST));
        
        if(!empty($search)) {
          $result = $abook->search(array('name','email'),$search, $search_mode, true, true, 'email');
          while ($sql_arr = $result->iterate()) {
            foreach ((array)$abook->get_col_values('email', $sql_arr, true) as $email) {
              $contact = format_email_recipient($email, $sql_arr['name']);
              $contacts[] = array('name' => $sql_arr['name'] , 'email' => format_email_recipient($email, $sql_arr['name']));
            }
          }
          if($abook->groups) {
            foreach($abook->list_groups($search) as $group) {
              $abook->reset();
              $abook->set_group($group['ID']);
              $result = $abook->count();
              if ($result->count) {
                $contacts[] = array('name' => $group['name'] . ' (' . intval($result->count) . ')', 'id' => $group['ID'], 'source' => $id);
              }
            }
          }
        } 
      }
    }
    
    sort($contacts);
    
    // send the addressbook back to javascript
    $rcmail->output->command('plugin.compose_addressbook_receive', array('addresses' => $contacts));    
  }
  
  // expand all the groups that we added
  function expand_groups() {
    $rcmail = rcmail::get_instance();
    
    $group_ids_input=trim(get_input_value('_groupids', RCUBE_INPUT_GET));
    $group_sources_input=trim(get_input_value('_groupsources', RCUBE_INPUT_GET));
    $target = trim(get_input_value('_target', RCUBE_INPUT_GET));
    
    if($group_ids_input == '' || $group_sources_input == '') exit;
    
    $group_ids = explode(',', $group_ids_input);
    $group_sources = explode(',', $group_sources_input);
    
    // create a list of ids per address source
    for($i=0; $i<count($group_sources);$i++) {
      $address_sources[$group_sources[$i]][] = $group_ids[$i];
    }
    
    // iterate over each address source and get the expanded groups
    $members = array();
    foreach($address_sources as $source => $groups) {
      $abook = $rcmail->get_address_book($source);
      foreach($groups as $group) {
        $abook->set_group($group);
        $abook->set_pagesize(1000);
        $result = $abook->list_records(array('email','name'));
        while ($result && ($sql_arr = $result->iterate())) {
          $email = (array)$sql_arr['email'];
          $members[] = format_email_recipient($email[0], $sql_arr['name']);
        }
      }
    }
    $rcmail->output->command('plugin.compose_addressbook_receive_expand', array('members' => array_unique($members), 'target' => $target));
  }
}
?>
