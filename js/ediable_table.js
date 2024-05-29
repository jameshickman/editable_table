class EditableTable {
    #top_index;
    #index_column;
    #el_active_row;
    #el_edit_form;
    #el_table;
    #el_table_body;
    #els_table_headers;
    #fields;
    #labels;

    #is_new;

    #cb_saved;
    #cb_deleted;

    #cb_edit_start;
    #cb_edit_end;

    /**
     * Constructor for CRUD operations on an HTML table.
     * 
     * Configuration:
     *      fields: Definitions for field types that require additional metadata for checkbox and select controls
     *      labels: optional, set of label strings for edit, delete, delete confirmation, save, and cancel buttons.
     * 
     * @param {HTMLElement} el                  The HTML Table
     * @param {CallableFunction} cb_saved       Callback when row is saved, passed flag indicating a new row, row index, and row data
     * @param {CallableFunction} cb_deleted     Callback on delete, passed the row ID
     * @param {Object} config                   Configuration object
     */
    constructor(
        el, 
        cb_saved,
        cb_deleted,
        config
    ) {
        this.#el_table = el;
        this.#el_table_body = el.querySelector("tbody");
        this.#els_table_headers = el.querySelectorAll("table thead tr th");
        if (typeof cb_saved === 'function') this.#cb_saved = cb_saved;
        if (typeof cb_deleted === 'function') this.#cb_deleted = cb_deleted;
        if (config !== undefined) {
            if (config.hasOwnProperty('fields')) {
                this.#fields = config.fields;
            }
            else {
                this.#fields = {};
            }
            if (config.hasOwnProperty('labels')) {
                this.#labels = config.labels;
            }
            else {
                this.#labels = {
                    "edit": "Edit",
                    "delete": "Delete",
                    "confirm": "Are you sure you want to delete this row?",
                    "save": "Save",
                    "cancel": "Cancel",
                    "yes": "Yes",
                    "no": "No"
                };
            }
        }
        // Add column for the edit button
        const header = el.querySelector("thead tr");
        const new_header = document.createElement("TH");
        header.appendChild(new_header);
        this.build_edit_buttons();
        this.#top_index = 0;
        this.#find_top_index();
        this.#is_new = false;
    }

    /**
     * Create the edit and delte buttons for each row in the table
     */
    build_edit_buttons() {
        const els_rows = this.#el_table.querySelectorAll("tbody tr");
        for (let i = 0; i < els_rows.length; i++) {
            els_rows[i].appendChild(this.#create_edit_link());
        }
    }

    /**
     * Reset and empty the table and clear any editing operations
     */
    reset() {
        this.#clear(false);
        this.#empty();
    }

    /**
     * Replace the row ID, for the case where the server returns a real ID from the database.
     * As well as replacement values for any other column, useful if there is a UUID columm
     * where the value is server generated.
     * 
     * @param {Integer} old_id The ID number of the row to alter as it is in the table
     * @param {Integer} new_id Override to replace the ID field of the row
     * @param {Object} updates Object of values to replace in any column, key the name of the column
     */
    override_id(old_id, new_id, updates) {
        const els_rows = this.#el_table_body.querySelectorAll('TR');
        let el_idx = 0;
        let row_index = 0;
        for (let i = 0; i < els_rows.length; i++) {
            el_idx = els_rows[i].children[this.#index_column];
            if (el_idx.innerText == old_id) {
                row_index = i;
                el_idx.innerText = new_id;
                break;
            }
        }
        if (updates !== undefined) {
            for (let i = 0; i < this.#els_table_headers.length - 1; i++) {
                 const var_name = this.#els_table_headers[i].dataset['name'];
                 if (updates.hasOwnProperty(var_name)) {
                    els_rows[row_index].children[i].innerText = updates[var_name];
                 }
            }
        }
        this.#disable_enable_action_buttons(false);
        this.#find_top_index();
    }

    /**
     * Set the button labels and delete confirm message
     * 
     * @param {string} t_edit 
     * @param {string} t_delete 
     * @param {string} t_confirmation 
     * @param {string} t_save 
     * @param {string} t_cancel 
     * @param {string} t_yes
     * @param {string} t_no
     */
    set_labels(t_edit, t_delete, t_confirmation, t_save, t_cancel, t_yes, t_no) {
        this.#labels = {
            "edit": t_edit,
            "delete": t_delete,
            "confirm": t_confirmation,
            "save": t_save,
            "cancel": t_cancel,
            "yes": t_yes,
            "no": t_no
        };
    }

    /**
     * Set the labels for a checkbox column
     * 
     * @param {string} field Name of the field
     * @param {string} yes_label Label string for yes
     * @param {string} no_label Label string for no
     */
    set_yes_no(field, yes_label, no_label) {
        if (yes_label === undefined) yes_label = "Yes";
        if (no_label === undefined) no_label = "No";
        this.#fields[field] = {
            "labels": {
                "true": yes_label,
                "false": no_label
            }
        };
    }

    /**
     * Set the options for a select element
     * 
     * @param {string} field Name of the column
     * @param {Object} options Key value pairs for the options
     */
    set_select_options(field, options) {
        this.#fields[field] = {
            "options": options
        };
    }

    /**
     * Add a row to the end of the table
     * 
     * @param {Object} row key value set, keys are the names of the columns
     */
    add_row(row) {
        this.#is_new = true;
        this.#build_new_row(row);
        this.#find_top_index();
    }

    /**
     * Add a new row to the end of the table and open it in edit mode
     */
    new_row() {
        this.#is_new = true;
        this.#find_top_index();
        this.#top_index += 1;
        this.#disable_enable_action_buttons(true);
        this.#build_new_row([]);
        this.#edit_new_row(true);
    }

    /**
     * Pass an array of objects to populate the table.
     * 
     * @param {Array<Object>} rows 
     */
    set_rows(rows) {
        this.#empty();
        for (let i = 0; i < rows.length; i++) {
            const el_row = document.createElement('TR');
            for (let j = 0; j < this.#els_table_headers.length; j++) {
                const el_cell = document.createElement('TD');
                const d_type = this.#els_table_headers[j].dataset['type'];
                const d_name = this.#els_table_headers[j].dataset['name'];
                switch(d_type) {
                    case 'select':
                        el_cell.innerText = this.#fields[d_name].options[rows[i][d_name]];
                        break;
                    case 'bool':
                        if (rows[i][d_name]) {
                            el_cell.innerText = this.#fields[d_name].labels.true;
                        }
                        else {
                            el_cell.innerText = this.#fields[d_name].labels.false;
                        }
                        break;
                    default:
                        el_cell.innerText = rows[i][d_name];    
                }
                el_row.appendChild(el_cell);
            }
            el_row.appendChild(this.#create_edit_link());
            this.#el_table_body.appendChild(el_row);
        }
    }

    /**
     * Get an array of objects of the balues in the table
     * 
     * @returns Array<Object> data in the table
     */
    get_values() {
        const els_rows = this.#el_table.querySelectorAll("table tbody tr");
        let values = [];
        for (let i = 0; i < els_rows.length; i++) {
            values.push(this.#decode_row(els_rows[i]));
        }
        return values;
    }

    /**
     * Callbacks to be informed when entering and exiting the editor mode
     * 
     * @param {CallableFunction} cb_start Called when the edit mode starts
     * @param {CallableFunction} cb_end   Called ehwn the edit mode ends
     */
    set_edit_callbacks(cb_start, cb_end) {
        this.#cb_edit_start = cb_start;
        this.#cb_edit_end = cb_end;
    }

    // Internal methods
    #getChildElementIndex(node) {
        return Array.prototype.indexOf.call(node.parentNode.children, node);
    }

    #empty() {
        const els_rows = this.#el_table.querySelectorAll("table tbody tr");
        for (let i = 0; i < els_rows.length; i++) {
            els_rows[i].remove();
        }
    }

    #decode_row(el_row) {
        let values = {};
        for (let i = 0; i < this.#els_table_headers.length; i++) {
            const d_type = this.#els_table_headers[i].dataset['type'];
            const d_name = this.#els_table_headers[i].dataset['name'];
            switch (d_type) {
                case 'index':
                case 'int':
                    values[d_name] = parseInt(el_row.children[i].innerText);
                    break;
                case 'float':
                    values[d_name] = parseFloat(el_row.children[i].innerText);
                    break;
                case 'bool':
                    if (el_row.children[i].innerText == this.#fields[d_name]['labels']['true']) {
                        values[d_name] = true;
                    }
                    else {
                        values[d_name] = false;
                    }
                    break;
                case 'text':
                    values[d_name] = el_row.children[i].innerText;
                    break;
                case 'select':
                    const options = this.#fields[d_name].options;
                    const label = el_row.children[i].innerText;
                    for (let option in options) {
                        if (options[option] == label) {
                            values[d_name] = option;
                            break;
                        }
                    }
                    break;
                default:
                    values[d_name] = el_row.children[i].innerText;
            }
        }
        return values;
    }

    #build_new_row(d) {
        this.#el_active_row = document.createElement('TR');
        this.#el_table_body.appendChild(this.#el_active_row);
        for (let i = 0; i < this.#els_table_headers.length; i++) {
            const new_cell = document.createElement('TD');
            if (i == this.#index_column) {
                if (d.length >= i && Number.isInteger(d[i])) {
                    new_cell.innerText = parseInt(d[i]);
                }
                else {
                    new_cell.innerText = this.#top_index;
                }
            }
            else if (d !== null && d.length >= this.#els_table_headers.length) {
                new_cell.innerText = d[i];
            }
            this.#el_active_row.appendChild(new_cell);
        }
        this.#el_active_row.appendChild(this.#create_edit_link());
    }

    #build_form_element(idx, values) {
        const d_type = this.#els_table_headers[idx].dataset['type'];
        const d_name = this.#els_table_headers[idx].dataset['name'];
        let el_input = null;
        switch (d_type) {
            case 'int':
                el_input = document.createElement('INPUT');
                el_input.type = "number";
                el_input.step = "1";
                if (values[idx] != '') {
                    el_input.value = parseInt(values[idx]);
                }
                break;
            case 'float':
                el_input = document.createElement('INPUT');
                el_input.type = "number";
                if (values[idx] != '') {
                    el_input.value = parseFloat(values[idx]);
                }
                break;
            case 'bool':
                el_input = document.createElement('INPUT');
                el_input.type = "checkbox";
                if (values[idx] == this.#fields[d_name]['labels']['true']) {
                    el_input.checked = true;
                }
                break;
            case 'select':
                el_input = document.createElement('SELECT');
                for (let key in this.#fields[d_name]['options']) {
                    const el_option = document.createElement('OPTION');
                    el_option.value = key;
                    el_option.innerText = this.#fields[d_name]['options'][key];
                    el_input.appendChild(el_option);
                    if (this.#fields[d_name]['options'][key] == values[idx]) {
                        el_input.value = key;
                    }
                }
                break;
            case 'text':
                // Text line
                el_input = document.createElement('INPUT');
                el_input.type = 'text';
                el_input.value = values[idx];
                break;
            default:
                el_input = document.createElement('SPAN');
                el_input.innerText = values[idx];
        }
        el_input.id = d_name;
        el_input.name = d_name;
        return el_input;
    }

    #save_row() {
        let index = 0;
        let payload = {};
        const els_cells = this.#el_edit_form.querySelectorAll("td");
        for (let i = 0 ; i < this.#els_table_headers.length; i++) {
            const d_type = this.#els_table_headers[i].dataset['type'];
            const d_name = this.#els_table_headers[i].dataset['name'];
            switch(d_type) {
                case 'int':
                case 'float':
                case 'text':
                    const val = this.#el_edit_form.children[i].querySelector('input').value;
                    this.#el_active_row.children[i].innerText = val;
                    if (d_type == 'int') {
                        payload[d_name] = parseInt(val);
                    }
                    else if (d_type == 'float') {
                        payload[d_name] = parseFloat(val);
                    }
                    else {
                        payload[d_name] = val;
                    }
                    break;
                case 'bool':
                    if (this.#el_edit_form.children[i].querySelector('input').checked) {
                        this.#el_active_row.children[i].innerText = this.#fields[d_name].labels['true'];
                        payload[d_name] = true;
                    }
                    else {
                        this.#el_active_row.children[i].innerText = this.#fields[d_name].labels['false'];
                        payload[d_name] = false;
                    }
                    break;
                case 'select':
                    const select_control = this.#el_edit_form.children[i].querySelector("select");
                    const key = select_control.options[select_control.selectedIndex].value;
                    const select_val = this.#fields[d_name].options[key];
                    this.#el_active_row.children[i].innerText = select_val;
                    payload[d_name] = key;
                    break;
                case 'index':
                    index = parseInt(this.#el_edit_form.children[i].querySelector('span').innerText);
                    payload[d_name] = index;
                    break;
                default:
                    payload[d_name] = this.#el_edit_form.children[i].innerText;
            }
        }

        this.#clear();

        if (this.#cb_saved) {
            const row_id = this.#cb_saved(this.#is_new, index, payload);
        }
    }

    #clear(clear_new) {
        if (this.#el_edit_form !== undefined) {
            this.#el_edit_form.remove();
        }
        if (clear_new === true) {
            this.#el_active_row.remove();
        }
        else if (this.#el_active_row !== undefined) {
            this.#el_active_row.style.display = 'table-row';
        }
        this.#el_edit_form = undefined;
        this.#el_active_row = undefined;
    }

    #edit_new_row(is_new) {
        this.#el_active_row.style.display = 'none';
        // Get the row index
        const row_index = this.#getChildElementIndex(this.#el_active_row);
        // Extract the existing values
        const raw_values = [];
        for (let i = 0; i < this.#el_active_row.children.length - 1; i++) {
            raw_values.push(this.#el_active_row.children[i].innerText);
        }
        // Insert form row
        this.#el_edit_form = this.#el_table_body.insertRow(row_index);
        this.#el_edit_form.classList.add('table__inline-edit-form');
        // Build form cells
        for (let i = 0; i < this.#el_active_row.children.length - 1; i++) {
            const el_cell = document.createElement('TD');
            el_cell.appendChild(this.#build_form_element(i, raw_values));
            this.#el_edit_form.appendChild(el_cell);
        }
        // Save and Cancle buttons
        const el_action_container = document.createElement('TD');
        el_action_container.classList.add('_smart-table__actions-container');
        const el_save = document.createElement('BUTTON');
        el_save.addEventListener('click', this.#save_row_clicked.bind(this));
        el_save.innerText = this.#labels.save;
        const el_cancel = document.createElement('BUTTON');
        if (is_new === true) {
            el_cancel.addEventListener('click', this.#cancel_new_clicked.bind(this));
        }
        else {
            el_cancel.addEventListener('click', this.#cancle_clicked.bind(this));
        }
        el_cancel.innerText = this.#labels.cancel;
        el_action_container.appendChild(el_save);
        el_action_container.appendChild(el_cancel);
        this.#el_edit_form.appendChild(el_action_container);

        if (typeof this.#cb_edit_start == 'function') this.#cb_edit_start();
    }

    #find_top_index() {
        // Find the index column
        const els_rows = this.#el_table.querySelectorAll("table tbody tr");
        for (let i = 0; i < this.#els_table_headers.length; i++) {
            if (this.#els_table_headers[i].dataset.type == "index") {
                this.#index_column = i;
                break;
            }
        }
        // Find the largest index
        for (let i = 0; i < els_rows.length; i++) {
            const row_index = parseInt(els_rows[i].children[this.#index_column].innerText);
            if (row_index > this.#top_index) this.#top_index = row_index;
        }
    }

    #disable_enable_action_buttons(disable) {
        const els_action_buttons = this.#el_table_body.querySelectorAll('._action_buttons');
        for (let i = 0; i < els_action_buttons.length; i++) {
            els_action_buttons[i].disabled = disable;
        }
    }

    #create_edit_link() {
        const el_cell = document.createElement("TD");
        el_cell.classList.add("_smart-table__edit-row");
        const el_edit_button = document.createElement("BUTTON");
        el_edit_button.classList.add('_action_buttons');
        el_edit_button.innerText = this.#labels.edit;
        el_edit_button.addEventListener('click', this.#edit_clicked.bind(this));
        const el_delete_button = document.createElement("BUTTON");
        el_delete_button.classList.add('_action_buttons');
        el_delete_button.innerText = this.#labels.delete;
        el_delete_button.addEventListener('click', this.#delete_clicked.bind(this));
        el_cell.appendChild(el_edit_button);
        el_cell.appendChild(el_delete_button);
        return el_cell;
    }

    // UI callbacks
    #edit_clicked(e) {
        this.#is_new = false;
        this.#disable_enable_action_buttons(true);
        // Make sure only one edit can be active
        if (this.#el_active_row !== undefined) this.#clear();
        // Get the row element
        this.#el_active_row = e.currentTarget.parentNode.parentNode;
        this.#edit_new_row(false);
    }

    #save_row_clicked(e) {
        this.#save_row();
        this.#disable_enable_action_buttons(false);
        if (typeof this.#cb_edit_end == "function") this.#cb_edit_end();
    }

    #cancle_clicked() {
        this.#clear(false);
        this.#disable_enable_action_buttons(false);
        if (typeof this.#cb_edit_end == "function") this.#cb_edit_end();
    }

    #cancel_new_clicked() {
        this.#top_index -= 1;
        this.#clear(true);
        this.#disable_enable_action_buttons(false);
        if (typeof this.#cb_edit_end == "function") this.#cb_edit_end();
    }

    #delete_clicked(e) {
        const row = e.currentTarget.parentNode.parentNode;
        row.classList.add('table__row-to-delete');
        this.#dialog_confirm(
            this.#labels.confirm,
            () => {
                const idx = parseInt(row.children[this.#index_column].innerText);
                row.remove();
                if (this.#cb_deleted) this.#cb_deleted(idx);
            },
            () => {
                row.classList.remove('table__row-to-delete');
            }
        )
    }

    // Utility operations for dialogs, etc.
    #dialog_confirm(message, cb_yes, cb_no) {
        const el_dialog = document.createElement('DIV');
        el_dialog.style['position'] = 'fixed';
        el_dialog.style['top'] = '0';
        el_dialog.style['bottom'] = '0';
        el_dialog.style['left'] = '0';
        el_dialog.style['right'] = '0';
        el_dialog.style['z-index'] = '99999';
        el_dialog.style['display'] = 'flex';
        el_dialog.style['align-items'] = 'center';
        el_dialog.style['justify-content'] = 'center';
        el_dialog.style['background-color'] = 'rgba(0, 0, 0, 0.5)';
        const el_popup = document.createElement('DIV');
        el_popup.style['background-color'] = 'white';
        el_popup.style['min-width'] = '300px';
        el_popup.style['padding'] = '21px';
        el_popup.style['border-radius'] = '17px';
        const el_message_container = document.createElement('P');
        el_message_container.innerText = message;
        const el_button_container = document.createElement('DIV');
        el_button_container.style['display'] = 'flex';
        el_button_container.style['justify-content'] = 'flex-end';
        el_button_container.style['gap'] = '5px';
        el_button_container.style['margin-top'] = '21px';
        const el_button_yes = document.createElement('BUTTON');
        el_button_yes.classList.add("dialog__button-yes");
        el_button_yes.innerText = this.#labels.yes;
        el_button_yes.addEventListener('click', () => {
            el_dialog.remove();
            cb_yes();
        });
        const el_button_no = document.createElement('BUTTON');
        el_button_no.classList.add('dialog__button-no');
        el_button_no.innerText = this.#labels.no;
        el_button_no.addEventListener('click', () => {
            el_dialog.remove();
            cb_no();
        });
        el_button_container.appendChild(el_button_yes);
        el_button_container.appendChild(el_button_no);
        el_popup.appendChild(el_message_container);
        el_popup.appendChild(el_button_container);
        el_dialog.appendChild(el_popup);
        document.body.appendChild(el_dialog);
    }
}

export default EditableTable;