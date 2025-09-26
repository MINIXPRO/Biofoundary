// Copyright (c) 2025, Pragati Dike and contributors
// For license information, please see license.txt


frappe.ui.form.on("Material Request for Biofoundry", {
    refresh: function(frm) {
        // Clear any existing timers
        if (frm.job_card_timers) {
            frm.job_card_timers.forEach(timer => clearInterval(timer));
        }
        frm.job_card_timers = [];
        
        // Set the HTML template first
        set_job_card_html_template(frm);
        updateOverdueRemarks(frm);

        update_todo_statuses(frm);
        frm.biofoundary_types = ["Plasmid", "Oligo", "LNP"];
        
        
        // Get job card data and populate HTML
        if (frm.doc.job_card && frm.doc.job_card.length > 0) {
            let job_cards_data = [];
            let completed_requests = 0;
            
            frm.doc.job_card.forEach(row => {
                // Fetch job card details
                frappe.call({
                    method: "frappe.client.get",
                    args: {
                        doctype: "Job Card",
                        name: row.job_card
                    },
                    callback: function(r) {
                        completed_requests++;
                        if (r.message) {
                            job_cards_data.push(r.message);
                        }
                        
                        // Update HTML when all data is loaded
                        if (completed_requests === frm.doc.job_card.length) {
                            update_job_card_html(frm, job_cards_data);
                            // Start live timers after HTML is rendered
                            setTimeout(() => start_live_timers(frm, job_cards_data), 500);
                        }
                    }
                });
            });
        } else {
            // If no job cards, show empty state
            update_job_card_html(frm, []);
        }

        if (frm.doc.work_order && frm.doc.workflow_state === "Order created") {
            frm.add_custom_button(__("Start"), function () {
                let max = flt(frm.doc.qty || 1);  // use qty field from your doctype, default 1 if empty

                frappe.prompt(
                    [
                        {
                            fieldtype: "Float",
                            label: __("Qty for Material Transfer"),
                            fieldname: "qty",
                            description: __("Max: {0}", [max]),
                            default: max,
                        }
                    ],
                    function (data) {
                        frappe.call({
                            method: "erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry",
                            args: {
                                work_order_id: frm.doc.work_order,
                                purpose: "Material Transfer for Manufacture",
                                qty: data.qty,
                            },
                            callback: function (r) {
                                if (r.message) {
                                    let doc = frappe.model.sync(r.message);
                                    frappe.set_route("Form", doc[0].doctype, doc[0].name);
                                }
                            }
                        });
                    },
                    __("Select Quantity"),
                    __("Create")
                );
            }).addClass("btn-primary");
        }
         if (frm.doc.status !== "Closed" && frm.doc.docstatus === 1) {
            frm.page.set_inner_btn_group_as_primary(__("Create"));
        }
        // Auto-update items table cost centers
        if (frm.doc.custom_cost_centre) {
            frm.doc.items.forEach(item => { item.segment = frm.doc.custom_cost_centre; });
        }
        if (frm.doc.custom_cc) {
            frm.doc.items.forEach(item => { item.custom_parent_cost_center = frm.doc.custom_cc; });
        }
        if (frm.doc.custom_line_of_business) {
            frm.doc.items.forEach(item => { item.cost_center = frm.doc.custom_line_of_business; });
        }
        frm.refresh_field('items');

       

        // Create Work Order button
        if (frm.doc.workflow_state === "Work In Progress") {
            frm.add_custom_button(__('Create Work Order'), function() {
                if (!frm.doc.bom_no) {
                    frappe.msgprint(__('Please set a BOM first'));
                    return;
                }

                let d = new frappe.ui.Dialog({
                    title: __('Work Order'),
                    fields: [
                        {
                            label: __('Qty to Manufacture'),
                            fieldname: 'qty',
                            fieldtype: 'Float',
                            reqd: 1,
                            default: frm.doc.quantity || 1
                        },
                        {
                            label: __('Use Multi-Level BOM'),
                            fieldname: 'use_multi_level_bom',
                            fieldtype: 'Check',
                            default: 1
                        },
                        {
                            label: __('Target Warehouse'),
                            fieldname: 'fg_warehouse',
                            fieldtype: 'Link',
                            options: 'Warehouse',
                            reqd: 1,
                            default: frm.doc.fg_warehouse || '',
                            get_query: () => {
                                return { filters: { company: frm.doc.company, is_group: 0 } };
                            }
                        },
                        {
                            label: __('Work-in-Progress Warehouse'),
                            fieldname: 'wip_warehouse',
                            fieldtype: 'Link',
                            options: 'Warehouse',
                            reqd: 1,
                            default: frm.doc.wip_warehouse || '',
                            get_query: () => {
                                return { filters: { company: frm.doc.company, is_group: 0 } };
                            }
                        }
                        
                    ],
                    primary_action_label: __('Create'),
                    primary_action(values) {
                        frappe.call({
                            method: "erpnext.manufacturing.doctype.work_order.work_order.make_work_order",
                            args: {
                                item: frm.doc.item,
                                bom_no: frm.doc.bom_no,
                                qty: values.qty,
                                use_multi_level_bom: values.use_multi_level_bom,
                                fg_warehouse: values.fg_warehouse,
                                wip_warehouse: values.wip_warehouse
                                
                            },
                            callback: function(r) {
                                if (!r.exc) {
                                
                                    r.message.fg_warehouse = values.fg_warehouse;
                                    r.message.wip_warehouse = values.wip_warehouse;
                                    
                                    frappe.call({
                                        method: "frappe.client.insert",
                                        args: { doc: r.message },
                                        callback: function(insert_res) {
                                            if (!insert_res.exc) {
                                                let work_order_name = insert_res.message.name;

                                               
                                                // Link Work Order to this form
                                                frm.set_value('work_order', work_order_name);

                                                // Fill Work Order tab fields
                                                frm.set_value("production_item", insert_res.message.production_item);
                                                frm.set_value("production_quantity", insert_res.message.qty);
                                                frm.set_value("use_multi_level_bom", insert_res.message.use_multi_level_bom);
                                                frm.set_value("planned_start_date", insert_res.message.planned_start_date);
                                                frm.set_value("target_warehouse", insert_res.message.fg_warehouse);
                                                frm.set_value("bom", insert_res.message.bom_no);
                                                frm.set_value('work_order', work_order_name);
                                                frm.set_value('wip_warehouse', insert_res.message.wip_warehouse);
                                                frm.set_value('required_items', insert_res.message.required_items);
                                                frm.set_value('operation', insert_res.message.operations);
                                                console.log("WO created value set");
                                                frm.save();
                                                frm.save("Submit");

                                                frappe.call({
                                                    method: "frappe.client.submit",
                                                     args: {
                                                        doc: insert_res.message   // full document object
                                                    },
                                                    callback: function(submit_res) {
                                                        if (!submit_res.exc) {
                                                            frappe.msgprint(__('Work Order {0} created and submitted', [work_order_name]));
                                                            frm.trigger("load_job_cards");
                                    
                                                            // Link submitted Work Order to this form
                                                            frm.set_value('work_order', work_order_name);
                                                            frm.refresh_field("work_order");
                                                            frm.save();
                                                             frm.refresh_field("job_card");
                                                        }
                                                    }
                                                });
                                                
                                                
                                                
                                                // Fill required items table
                                                frm.clear_table("work_order_required_items");
                                                (insert_res.message.required_items || []).forEach(item => {
                                                    let row = frm.add_child("work_order_required_items");
                                                    row.item_code = item.item_code;
                                                    row.source_warehouse = item.source_warehouse;
                                                    row.required_qty = item.required_qty;
                                                    row.transferred_qty = item.transferred_qty;
                                                    row.consumed_qty = item.consumed_qty;
                                                    row.returned_qty = item.returned_qty;
                                                });
                                                frm.refresh_field("work_order_required_items");

                                                frappe.msgprint(__('Work Order {0} created', [work_order_name]));
                                                console.log("WO created");
                                                frm.submit();
                                            }
                                        }
                                    });
                                }
                            }
                        });
                        d.hide();
                    }
                });

                d.show();
            });

        }
        $(document).off('click', '.btn-add-note').on('click', '.btn-add-note', function() {
            frappe.prompt(
                [
                    {
                        fieldtype: 'Select',
                        fieldname: 'comment_type',
                        label: 'Comment Type',
                        reqd: 1,
                        options: [
                            'Resource Unavailable',
                            'Fogging and Cleaning',
                            'Equipment Qualification',
                            'Revised Timeline'
                        ]
                    },
                    {
                        fieldtype: 'Text Editor',
                        fieldname: 'comment',
                        label: 'Biofoundry Note',
                        reqd: 1
                    }
                    
                ],
                function(values) {
                    let child = frm.add_child('note'); 
                    child.comment_type = values.comment_type;
                    child.comment = values.comment;
                    child.added_by = frappe.session.user_fullname;
                    child.created_on = frappe.datetime.now_datetime();
                    frm.refresh_field('note');
                    frappe.show_alert({ message: __('Biofoundry Note added'), indicator: 'green' });
                    
                },
                __('Add Note'),
                __('Submit')
            );
        });
    
    },
    before_insert: function(frm) {
        if (!frm.doc.company) {
            frm.set_value("company", frappe.defaults.get_default("company"));
        }
    },
     validate(frm) {
        updateOverdueRemarks(frm);
    },

    after_save: function(frm) {
        console.log("Document saved, checking for assignments");

        if (frm.doc.table_sumu && frm.doc.table_sumu.length) {
            frm.doc.table_sumu.forEach(function(child_row) {
                if (child_row.assign_to) {
                    assign_document(frm, child_row);
                }
            });
        }
    },
    biofoundary_type(frm) {
        if (frm.doc.biofoundary_type) {
            frm.clear_table('item_detail');
        }
    },

    setup: function(frm) {
        frm.trigger("setup_queries");
    },
    bom_no: function(frm) {
        if (frm.doc.bom_no) {
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "BOM",
                    name: frm.doc.bom_no
                },
                callback: function(r) {
                    if (r.message) {
                        frm.clear_table("operations");
                        (r.message.operations || []).forEach(op => {
                            let row = frm.add_child("operations");
                            row.operation = op.operation;
                            row.workstation = op.workstation;
                            row.time_in_mins = op.time_in_mins;
                            row.fixed_time = op.fixed_time;
                            row.operating_cost = op.operating_cost;
                            row.description = op.description;
                        });
                        frm.refresh_field("operations");
                    }
                }
            });
        }
    },


    // Function to load existing Work Order details
    
    
    get_items: function(frm) {
        if (!frm.doc.bom_no) {
            frappe.throw(__("Please select a BOM"));
            return;
        }
        if (!frm.doc.quantity || frm.doc.quantity <= 0) {
            frappe.throw(__("Please enter a valid quantity"));
            return;
        }
        frappe.call({
            method: "erpnext.manufacturing.doctype.bom.bom.get_bom_items",
            args: {
                bom: frm.doc.bom_no,
                company: frm.doc.company,
                qty: frm.doc.quantity,
                fetch_exploded: 1
            },
            callback: function(r) {
                if (r.message) {
                    frm.clear_table("items");
                    r.message.forEach(item => {
                        let d = frm.add_child("items");
                        d.item_code = item.item_code;
                        d.item_name = item.item_name;
                        d.description = item.description;
                        d.qty = item.qty;
                        d.transfer_qty = item.qty;
                        d.uom = item.stock_uom;
                        d.stock_uom = item.stock_uom;
                        d.basic_rate = item.rate;
                        d.conversion_factor = 1;
                        d.segment = frm.doc.custom_cost_centre;
                        d.cost_center = frm.doc.custom_line_of_business;
                        d.custom_parent_cost_center = frm.doc.custom_cc;
                        if(frm.doc.s_warehouse) d.s_warehouse = frm.doc.s_warehouse;
                        if(frm.doc.t_warehouse) d.t_warehouse = frm.doc.t_warehouse;
                    });
                    frm.refresh_field("items");
                    frm.trigger("show_material_request_planning");
                }
            }
        });
    },
    
    load_work_order_data: function(frm) {
        frappe.call({
            method: "frappe.client.get",
            args: { doctype: "Work Order", name: frm.doc.work_order },
            callback: function(r) {
                if (r.message) {
                    frm.set_value("production_item", r.message.production_item);
                    frm.set_value("production_quantity", r.message.qty);
                    frm.set_value("use_multi_level_bom", r.message.use_multi_level_bom);
                    frm.set_value("planned_start_date", r.message.planned_start_date);

                    frm.clear_table("work_order_required_items");
                    (r.message.required_items || []).forEach(item => {
                        let row = frm.add_child("work_order_required_items");
                        row.item_code = item.item_code;
                        row.source_warehouse = item.source_warehouse;
                        row.required_qty = item.required_qty;
                        row.transferred_qty = item.transferred_qty;
                        row.consumed_qty = item.consumed_qty;
                        row.returned_qty = item.returned_qty;
                    });
                    frm.refresh_field("work_order_required_items");
                }
            }
        });
    },

    setup_queries: function(frm) {
        frm.set_query("bom_no", () => ({ filters: { docstatus: 1, is_active: 1 } }));
        frm.set_query("s_warehouse", "items", doc => ({ filters: { company: doc.company, is_group: 0 } }));
        frm.set_query("t_warehouse", "items", doc => ({ filters: { company: doc.company, is_group: 0 } }));
        frm.set_query("raw_materials_warehouse", doc => ({ filters: { company: doc.company, is_group: 0 } }));
        frm.set_query('custom_line_of_business', () => ({ filters: { 'is_group': 0 } }));
    },

    biofoundary_type: function(frm) {
        if (frm.doc.biofoundary_type === "Plasmid") {
            frm.set_value("custom_line_of_business", "4001241 - R&D Plasmid-LT - MCPL");
            frm.set_value("custom_cc", "40012400-R&D Plasmid & Oligos");
        } else if (frm.doc.biofoundary_type === "Oligo") {
            frm.set_value("custom_line_of_business", "LNP");
        }
    },

    make_material_request: function(frm) {
        let items_needed = false;
        if (frm.doc.raw_materials?.length) {
            for (let row of frm.doc.raw_materials) {
                if (row.need_to_add > 0) {
                    items_needed = true;
                    break;
                }
            }
        }
        if (!items_needed) {
            frappe.msgprint(__("No additional materials needed."));
            return;
        }
        frappe.confirm(
            __("Do you want to submit the material request for only the needed quantities?"),
            () => frm.events.create_material_request(frm, 1),
            () => frm.events.create_material_request(frm, 0)
        );
    },

    create_material_request(frm, submit) {
        frm.doc.submit_material_request = submit;
        let request_items = frm.doc.raw_materials
            .filter(item => item.need_to_add > 0)
            .map(item => ({
                item_code: item.item_code,
                item_name: item.item_name,
                description: item.description,
                qty: item.need_to_add,
                uom: item.uom,
                stock_uom: item.stock_uom,
                conversion_factor: 1,
                warehouse: item.for_warehouse || frm.doc.raw_materials_warehouse,
                cost_center: frm.doc.custom_line_of_business,
                segment: frm.doc.custom_cost_centre,
                custom_parent_cost_center: frm.doc.custom_cc
            }));

        if (!request_items.length) {
            frappe.msgprint(__("No material required to be requested."));
            return;
        }

        frappe.call({
            method: 'frappe.client.insert',
            args: {
                doc: {
                    doctype: 'Material Request',
                    material_request_type: 'Purchase',
                    transaction_date: frappe.datetime.nowdate(),
                    schedule_date: frappe.datetime.add_days(frappe.datetime.nowdate(), 7),
                    company: frm.doc.company,
                    custom_material_request_biofoundary: frm.doc.name,
                    items: request_items,
                    project_description: frm.doc.purpose
                }
            },
            callback: function(r) {
                if (!r.exc) {
                    frappe.msgprint(__('Material Request created: <a href="/app/material-request/{0}">{0}</a>', [r.message.name]));
                    frm.set_value("material_request", r.message.name);
                }
            }
        });
    },

    
    // Refresh HTML when job card table is updated
    job_card_add: function(frm) {
        frm.events.refresh(frm);
    },
    
    job_card_remove: function(frm) {
        frm.events.refresh(frm);
    },
    
    // Clean up timers when form is closed
    onload: function(frm) {
        frm.job_card_timers = [];
        if (frm.doc.list_kit_value && frm.doc.acceptance_date && frm.doc.table_sumu?.length === 0) {
            frm.trigger('list_kit_value');
        }
    },
     requested_from: function(frm) {
        calculateLeadTime(frm);
    },
    required_by: function(frm) {
        calculateLeadTime(frm);
    },
    acceptance_date: function(frm) { 
        calculateRequiredLeadTime(frm);
    },
    standard_timeline: function(frm) {
        
        // Trigger validation when standard timeline changes
        if (frm.doc.lead_time) {
            validateLeadTime(frm);
        }
    },
    table_sumu_add: function(frm) {
        calculateRequiredLeadTime(frm);
    },
    table_sumu_remove: function(frm) {
        calculateRequiredLeadTime(frm);
    },
    lead_time: function(frm) {
        validateLeadTime(frm);
    },
     onload_post_render: function(frm) {
            console.log("Form is loaded and rendered");
    
            if (frm.doc.work_order) {
                frm.trigger('work_order');  // Fetch job cards when form first opens
            }
    }, 
    
    work_order: function(frm) {
        if (frm.doc.work_order) {
            frappe.call({
                method: "frappe.client.get_list",  
                args: {
                    doctype: "Job Card",
                    filters: {
                        work_order: frm.doc.work_order
                    },
                    fields: [
                        "name",
                        "operation",
                        "status",
                        "for_quantity"
                        
                    ],
                    order_by: "creation asc"
                },
                callback: function(r) {
                    frm.clear_table("job_card"); // child table fieldname

                    if (!r.message || r.message.length === 0) {
                        frappe.msgprint(__('No Job Cards found for the selected Work Order.'));
                        frm.refresh_field("job_card");
                        return;
                    }

                    (r.message || []).forEach(job => {
                        let row = frm.add_child("job_card");
                        row.job_card = job.name;           // Map to actual child table field
                        row.operation = job.operation;
                        row.status = job.status;
                        row.completed_qty = job.for_quantity; // Map to actual child table field
                        //row.start_job = job.excepted_start_time;       // Map to actual child table field
                        //row.end_job = job.excepted_end_time;           // Map to actual child table field
                    });

                    frm.refresh_field("job_card");
                }
            });
        }
    },
    list_kit_value(frm) {
		if (!frm.doc.list_kit_value) return;
		frm.clear_table('table_sumu');
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Plasmid kit',
				name: frm.doc.list_kit_value
			},
			callback: function(r) {
				if (r.message) {

					const timeline_data = r.message.table_muma || [];
					let base_date = frm.doc.acceptance_date;

					timeline_data.forEach((row, index) => {
						const incrementedDate = frappe.datetime.add_days(base_date, index + 1);

						frm.add_child('table_sumu', {
							no: index + 1,
							day: row.day,
							date: incrementedDate,
							activity: row.activity,
							remark: row.remark
						});
					});
					frm.refresh_field('table_sumu');
					calculateRequiredLeadTime(frm); // Call the lead time calculation after populating the table
				}
			},
            
		});
        if (!frm.doc.list_kit_value) return;
        frm.clear_table('table_sumu');

        if (!frm.doc.acceptance_date) {
            frappe.msgprint({
                title: __('Missing Date'),
                indicator: 'red',
                message: __('Please enter an Acceptance Date before selecting a kit.')
            });
            return;
        }

        // Step 1: Get employee holiday list
        frappe.call({
            method: 'frappe.client.get_value',
            args: {
                doctype: 'Employee',
                filters: { user_id: frappe.session.user },
                fieldname: 'holiday_list'
            },
            callback: function(empRes) {
                if (!empRes.message || !empRes.message.holiday_list) {
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: __('No holiday list found for the employee.')
                    });
                    return;
                }

                let holiday_list = empRes.message.holiday_list;

                // Step 2: Get holiday dates
                frappe.call({
                    method: 'frappe.client.get',
                    args: {
                        doctype: 'Holiday List',
                        name: holiday_list
                    },
                    callback: function(holidayRes) {
                        let holidays = (holidayRes.message.holidays || []).map(h => h.holiday_date);

                        // Step 3: Get Plasmid Kit details
                        frappe.call({
                            method: 'frappe.client.get',
                            args: {
                                doctype: 'Plasmid kit',
                                name: frm.doc.list_kit_value
                            },
                            callback: function(r) {
                                if (r.message) {
                                    const timeline_data = r.message.table_muma || [];
                                    let base_date = frm.doc.acceptance_date;
                                    let prevDay = 0;
                                    let prevDate = base_date;

                                    timeline_data.forEach((row, index) => {
                                        const dayGap = row.day - prevDay;
                                        const workingDate = getNextWorkingDate(prevDate, holidays, dayGap);

                                        if (workingDate) {
                                            frm.add_child('table_sumu', {
                                                no: index + 1,
                                                day: row.day,
                                                date: workingDate, 
                                                standard_date_overdue: workingDate, 
                                                activity: row.activity,
                                                remark: row.remark,
                                                status: " ",
                                                activity_status: "Open"
                                            });

                                            prevDay = row.day;
                                            prevDate = workingDate;
                                        }
                                    });

                                    frm.refresh_field('table_sumu');
                                    calculateRequiredLeadTime(frm);
                                }
                            }
                        });
                    }
                });
            }
        });
        
	},
	acceptance_date(frm) {
		// Call calculateRequiredLeadTime when acceptance_date changes
		calculateRequiredLeadTime(frm);
	}

});

// Clean up timers when navigating away
$(window).on('beforeunload', function() {
    if (cur_frm && cur_frm.job_card_timers) {
        cur_frm.job_card_timers.forEach(timer => clearInterval(timer));
    }
});

function start_live_timers(frm, job_cards_data) {
    // Clear existing timers first
    if (frm.job_card_timers) {
        frm.job_card_timers.forEach(timer => clearInterval(timer));
    }
    frm.job_card_timers = [];
    
    job_cards_data.forEach((jobCard, index) => {
        // Only start timer for job cards that are in progress
        if (jobCard.status === 'Work In Progress') {
            // Get the current active time log
            let activeTimeLog = null;
            if (jobCard.time_logs && jobCard.time_logs.length > 0) {
                activeTimeLog = jobCard.time_logs.find(log => !log.to_time);
            }
            
            if (activeTimeLog) {
                // Calculate elapsed time since the start
                const startTime = new Date(activeTimeLog.from_time).getTime();
                const now = new Date().getTime();
                let initialElapsedSeconds = Math.floor((now - startTime) / 1000);
                
                // Create timer for this job card
                const timer = setInterval(() => {
                    initialElapsedSeconds++;
                    update_timer_display(jobCard.name, initialElapsedSeconds);
                }, 1000);
                
                frm.job_card_timers.push(timer);
                
                // Set initial time display
                update_timer_display(jobCard.name, initialElapsedSeconds);
            }
        }
    });
}

function update_timer_display(jobCardName, seconds) {
    // Find the timer display element for this job card
    const timerElement = $(`.job-card-item[data-job-card="${jobCardName}"] .timer-display`);
    
    if (timerElement.length > 0) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        const timeString = `<span class="hours">${hours.toString().padStart(2, '0')}</span>:` +
                          `<span class="minutes">${minutes.toString().padStart(2, '0')}</span>:` +
                          `<span class="seconds">${secs.toString().padStart(2, '0')}</span>`;
        
        timerElement.html(timeString);
    }
}

function set_job_card_html_template(frm) {
    const html_template = `
        <style>
            .job-cards-container {
                font-family: Arial, sans-serif;
                margin: 20px 0;
            }
            
            .job-card-item {
                border: 1px solid #ddd;
                border-radius: 8px;
                margin-bottom: 15px;
                background: #fff;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            
            .job-card-header {
                background: #f8f9fa;
                padding: 15px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
            }
            
            .job-card-title {
                font-weight: bold;
                font-size: 16px;
                color: #333;
                margin-bottom: 5px;
            }
            
            .job-card-status {
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                margin-left: auto;
            }
            
            .status-open { background: #e9ecef; color: #6c757d; }
            .status-work-in-progress { 
                background: #fff3cd; 
                color: #856404;
                animation: pulse 2s infinite;
            }
            .status-completed { background: #d4edda; color: #155724; }
            .status-cancelled { background: #f8d7da; color: #721c24; }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.7; }
                100% { opacity: 1; }
            }
            
            .job-card-body {
                padding: 15px;
            }
            
            .job-details-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 15px;
                margin-bottom: 15px;
            }
            
            .detail-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #f1f1f1;
            }
            
            .detail-label {
                font-weight: 600;
                color: #555;
                margin-right: 10px;
            }
            
            .detail-value {
                color: #333;
                text-align: right;
            }
            
            .progress-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .progress-bar {
                background: #e9ecef;
                height: 8px;
                border-radius: 4px;
                overflow: hidden;
                margin: 8px 0;
            }
            
            .progress-fill {
                background: linear-gradient(90deg, #28a745, #20c997);
                height: 100%;
                transition: width 0.3s ease;
            }
            
            .progress-text {
                font-size: 12px;
                color: #666;
                text-align: center;
            }
            
            .time-logs-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .time-log-item {
                background: #f8f9fa;
                padding: 10px;
                margin: 8px 0;
                border-radius: 4px;
                border-left: 4px solid #007bff;
            }
            
            .materials-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .materials-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }
            
            .materials-table th,
            .materials-table td {
                padding: 8px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            
            .materials-table th {
                background: #f8f9fa;
                font-weight: 600;
            }
            
            .section-title {
                font-weight: 600;
                color: #333;
                margin-bottom: 10px;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .timer-display {
                font-family: 'Courier New', monospace;
                font-size: 20px;
                font-weight: bold;
                color: #007bff;
                background: #f8f9fa;
                padding: 15px;
                border-radius: 4px;
                text-align: center;
                margin: 10px 0;
                border: 2px solid #007bff;
                box-shadow: 0 2px 8px rgba(0,123,255,0.2);
            }
            
            .timer-display.active {
                animation: timerGlow 2s infinite;
            }
            
            @keyframes timerGlow {
                0%, 100% { 
                    box-shadow: 0 2px 8px rgba(0,123,255,0.2);
                    border-color: #007bff;
                }
                50% { 
                    box-shadow: 0 2px 15px rgba(0,123,255,0.5);
                    border-color: #0056b3;
                }
            }
            
            .no-data {
                text-align: center;
                color: #999;
                font-style: italic;
                padding: 20px;
            }
            
            @media (max-width: 768px) {
                .job-details-grid {
                    grid-template-columns: 1fr;
                }
                
                .job-card-header {
                    flex-direction: column;
                    align-items: flex-start;
                }
                
                .job-card-status {
                    margin-left: 0;
                    margin-top: 10px;
                }
            }
        </style>
        <div class="job-cards-container" id="jobCardsContainer">
            <div class="no-data">Loading job cards...</div>
        </div>
    `;
    
    // Set the HTML template to the field
    frm.set_df_property('job_card_details', 'options', html_template);
    frm.refresh_field('job_card_details');
}

function update_job_card_html(frm, job_cards_data) {
    let html_content = `
        <style>
            .job-cards-container {
                font-family: Arial, sans-serif;
                margin: 20px 0;
            }
            
            .job-card-item {
                border: 1px solid #ddd;
                border-radius: 8px;
                margin-bottom: 15px;
                background: #fff;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            
            .job-card-header {
                background: #f8f9fa;
                padding: 15px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
            }
            
            .job-card-title {
                font-weight: bold;
                font-size: 16px;
                color: #333;
                margin-bottom: 5px;
            }
            
            .job-card-status {
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                margin-left: auto;
            }
            
            .status-open { background: #e9ecef; color: #6c757d; }
            .status-work-in-progress { 
                background: #fff3cd; 
                color: #856404;
                animation: pulse 2s infinite;
            }
            .status-completed { background: #d4edda; color: #155724; }
            .status-cancelled { background: #f8d7da; color: #721c24; }
            
            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.7; }
                100% { opacity: 1; }
            }
            
            .job-card-body {
                padding: 15px;
            }
            
            .job-details-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 15px;
                margin-bottom: 15px;
            }
            
            .detail-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #f1f1f1;
            }
            
            .detail-label {
                font-weight: 600;
                color: #555;
                margin-right: 10px;
            }
            
            .detail-value {
                color: #333;
                text-align: right;
            }
            
            .progress-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .progress-bar {
                background: #e9ecef;
                height: 8px;
                border-radius: 4px;
                overflow: hidden;
                margin: 8px 0;
            }
            
            .progress-fill {
                background: linear-gradient(90deg, #28a745, #20c997);
                height: 100%;
                transition: width 0.3s ease;
            }
            
            .progress-text {
                font-size: 12px;
                color: #666;
                text-align: center;
            }
            
            .time-logs-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .time-log-item {
                background: #f8f9fa;
                padding: 10px;
                margin: 8px 0;
                border-radius: 4px;
                border-left: 4px solid #007bff;
            }
            
            .materials-section {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #eee;
            }
            
            .materials-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 13px;
            }
            
            .materials-table th,
            .materials-table td {
                padding: 8px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            
            .materials-table th {
                background: #f8f9fa;
                font-weight: 600;
            }
            
            .section-title {
                font-weight: 600;
                color: #333;
                margin-bottom: 10px;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .timer-display {
                font-family: 'Courier New', monospace;
                font-size: 20px;
                font-weight: bold;
                color: #007bff;
                background: #f8f9fa;
                padding: 15px;
                border-radius: 4px;
                text-align: center;
                margin: 10px 0;
                border: 2px solid #007bff;
                box-shadow: 0 2px 8px rgba(0,123,255,0.2);
            }
            
            .timer-display.active {
                animation: timerGlow 2s infinite;
            }
            
            @keyframes timerGlow {
                0%, 100% { 
                    box-shadow: 0 2px 8px rgba(0,123,255,0.2);
                    border-color: #007bff;
                }
                50% { 
                    box-shadow: 0 2px 15px rgba(0,123,255,0.5);
                    border-color: #0056b3;
                }
            }
            
            .no-data {
                text-align: center;
                color: #999;
                font-style: italic;
                padding: 20px;
            }
            
            @media (max-width: 768px) {
                .job-details-grid {
                    grid-template-columns: 1fr;
                }
                
                .job-card-header {
                    flex-direction: column;
                    align-items: flex-start;
                }
                
                .job-card-status {
                    margin-left: 0;
                    margin-top: 10px;
                }
            }
        </style>
        <div class="job-cards-container">
    `;
    
    if (!job_cards_data || job_cards_data.length === 0) {
        html_content += '<div class="no-data">No job cards found</div>';
    } else {
        job_cards_data.forEach(jobCard => {
            const progressPercentage = jobCard.for_quantity > 0 ? 
                Math.round((jobCard.total_completed_qty / jobCard.for_quantity) * 100) : 0;
            
            const statusClass = getStatusClass(jobCard.status);
            
            // Check if there's an active time log (for live timer)
            let hasActiveTimer = false;
            if (jobCard.status === 'Work In Progress' && jobCard.time_logs && jobCard.time_logs.length > 0) {
                hasActiveTimer = jobCard.time_logs.some(log => !log.to_time);
            }
            
            html_content += `
                <div class="job-card-item" data-job-card="${jobCard.name}">
                    <div class="job-card-header">
                        <div>
                            <div class="job-card-title">${jobCard.name || 'N/A'}</div>
                            <small style="color: #666;">
                                Work Order: ${jobCard.work_order || 'N/A'} | 
                                Operation: ${jobCard.operation || 'N/A'}
                            </small>
                        </div>
                        <span class="job-card-status ${statusClass}">${jobCard.status || 'Unknown'}</span>
                    </div>
                    
                    <div class="job-card-body">
                        <div class="job-details-grid">
                            <div class="detail-item">
                                <span class="detail-label">Production Item:</span>
                                <span class="detail-value">${jobCard.production_item || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Workstation:</span>
                                <span class="detail-value">${jobCard.workstation || 'N/A'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">For Quantity:</span>
                                <span class="detail-value">${jobCard.for_quantity || 0}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Completed Qty:</span>
                                <span class="detail-value">${jobCard.total_completed_qty || 0}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Transferred Qty:</span>
                                <span class="detail-value">${jobCard.transferred_qty || 0}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Process Loss Qty:</span>
                                <span class="detail-value">${jobCard.process_loss_qty || 0}</span>
                            </div>
                        </div>
                        
                        <div class="progress-section">
                            <div class="section-title">Progress</div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progressPercentage}%;"></div>
                            </div>
                            <div class="progress-text">
                                ${jobCard.total_completed_qty || 0} of ${jobCard.for_quantity || 0} completed (${progressPercentage}%)
                            </div>
                        </div>
                        
                        ${hasActiveTimer ? `
                            <div class="timer-display active">
                                <span class="hours">00</span>:
                                <span class="minutes">00</span>:
                                <span class="seconds">00</span>
                            </div>
                        ` : ''}
                        
                        ${jobCard.required_items && jobCard.required_items.length > 0 ? `
                            <div class="materials-section">
                                <div class="section-title">Required Materials</div>
                                <table class="materials-table">
                                    <thead>
                                        <tr>
                                            <th>Item Code</th>
                                            <th>Required Qty</th>
                                            <th>Transferred Qty</th>
                                            <th>Available Qty</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${jobCard.required_items.map(item => `
                                            <tr>
                                                <td>${item.item_code || 'N/A'}</td>
                                                <td>${item.required_qty || 0}</td>
                                                <td>${item.transferred_qty || 0}</td>
                                                <td>${item.stock_qty || 0}</td>
                                                <td>${item.material_availability_status ? '✅ Available' : '❌ Not Available'}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                        
                        ${jobCard.time_logs && jobCard.time_logs.length > 0 ? `
                            <div class="time-logs-section">
                                <div class="section-title">Time Logs</div>
                                ${jobCard.time_logs.map(log => `
                                    <div class="time-log-item">
                                        <strong>From:</strong> ${formatDateTime(log.from_time)} | 
                                        <strong>To:</strong> ${log.to_time ? formatDateTime(log.to_time) : 'In Progress'} | 
                                        ${log.time_in_mins ? ` | <strong>Duration:</strong> ${log.time_in_mins} mins` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
    }
    
    html_content += '</div>';
    
    // Set the generated HTML content to the field
    frm.set_df_property('job_card_details', 'options', html_content);
    frm.refresh_field('job_card_details');
}

function getStatusClass(status) {
    const statusMap = {
        'Open': 'status-open',
        'Work In Progress': 'status-work-in-progress', 
        'Completed': 'status-completed',
        'Cancelled': 'status-cancelled'
    };
    return statusMap[status] || 'status-open';
}

function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `<span class="hours">${hours.toString().padStart(2, '0')}</span>:` +
           `<span class="minutes">${minutes.toString().padStart(2, '0')}</span>:` +
           `<span class="seconds">${secs.toString().padStart(2, '0')}</span>`;
}

function formatDateTime(datetime) {
    if (!datetime) return 'N/A';
    return new Date(datetime).toLocaleString();
}

function validateLeadTime(frm) {
    const leadTimeDaysMap = {
        'Giga Prep (5 - 10 mg)-(10days)': 10,
        'Maxi Prep (0.5 - 1 mg)-(10days)':10,
        'Akta Pure (10 - 100 mg)-(15days)':15,
        'AKTA Oligosynt (7-9 days)': 9,
        'Mermade (7-9 days)': 9,
        'Honya Biotech 192 (7-9 days)': 9,
        'Dr. Oligo (7-9 days)': 9,
        'AKTA Oligosynt (10-12 days)': 12,
        'Mermade (10-12 days)': 12,
        'Honya Biotech 192 (10-12 days)': 12,
        'Dr. Oligo (10-12 days)': 12,
    };
    
    const selectedTimeline = frm.doc.standard_timeline;
    const expectedDays = leadTimeDaysMap[selectedTimeline];
    
    console.log("selectedTimeline", selectedTimeline);
    console.log("expectedDays", expectedDays);
    
    if (!selectedTimeline || !expectedDays) {
        console.log("No standard timeline selected or invalid timeline");
        return;
    }
    
    // Extract numeric value from lead_time field (remove " Days" suffix)
    let leadTimeValue = frm.doc.lead_time;
    if (typeof leadTimeValue === 'string') {
        leadTimeValue = parseInt(leadTimeValue.replace(/\D/g, ''));
    }
    
    console.log("leadTimeValue", leadTimeValue);
    
    if (leadTimeValue < expectedDays) {
        frappe.msgprint({
            title: __('Invalid Lead Time'),
            message: __('Lead Time should be at least {0} days for the selected Standard Timeline "{1}".', [expectedDays, selectedTimeline]),
            indicator: 'red'
        });
        frm.set_value('lead_time', expectedDays + " Days");
    }
}

function calculateLeadTime(frm) {
    if (frm.doc.requested_from && frm.doc.required_by) {
        let requestedFrom = frappe.datetime.str_to_obj(frm.doc.requested_from);
        let requiredBy = frappe.datetime.str_to_obj(frm.doc.required_by);
        
        if (requiredBy < requestedFrom) {
            frappe.msgprint(__("Required By date cannot be before Requested From date."));
            frm.set_value('lead_time', null);
            return;
        }
        
        let diffInTime = requiredBy.getTime() - requestedFrom.getTime();
        let diffInDays = Math.ceil(diffInTime / (1000 * 3600 * 24)); // Use Math.ceil for consistency
        
        frm.set_value('lead_time', diffInDays + " Days");
        
        // Validate the calculated lead time against standard timeline
        if (frm.doc.standard_timeline) {
            setTimeout(() => validateLeadTime(frm), 100); // Small delay to ensure field is updated
        }
    } else {
        frm.set_value('lead_time', null);
    }
}

function calculateRequiredLeadTime(frm) {
    let tableData = frm.doc.table_sumu;
    
    if (!tableData || tableData.length === 0) {
        frm.set_value('requested_lead_time', null);
        return;
    }
    
    let lastRow = tableData[tableData.length - 1];
    
    if (!lastRow.date || !frm.doc.acceptance_date) {
        frm.set_value('requested_lead_time', null);
        return;
    }
    
    try {
        let lastRowDate = frappe.datetime.str_to_obj(lastRow.date);
        let acceptanceDate = frappe.datetime.str_to_obj(frm.doc.acceptance_date);
        
        if (lastRowDate && acceptanceDate) {
            let timeDiff = lastRowDate.getTime() - acceptanceDate.getTime();
            let diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
            
            // Ensure the difference is not negative
            if (diffDays < 0) {
                frappe.msgprint(__("Last row date cannot be before acceptance date."));
                frm.set_value('requested_lead_time', null);
                return;
            }
            
            frm.set_value('requested_lead_time', diffDays + " Days");
        } else {
            frm.set_value('requested_lead_time', null);
        }
    } catch (error) {
        console.error("Error calculating required lead time:", error);
        frm.set_value('requested_lead_time', null);
    }
}


function assign_document(frm, child_row) {
    // Check if ToDo already exists
    frappe.db.get_list('ToDo', {
        filters: {
            reference_type: frm.doctype,
            reference_name: frm.docname,
            allocated_to: child_row.assign_to
        },
        fields: ['name'],
        limit: 1
    }).then(function(existing_todos) {
        if (existing_todos.length > 0) {
            console.log(`ToDo already exists for ${child_row.assign_to}, skipping assignment.`);
            return; // Avoid duplicate assignment
        }

        // Assign new ToDo
        frappe.call({
            method: 'frappe.desk.form.assign_to.add',
            args: {
                doctype: frm.doctype,
                name: frm.docname,
                assign_to: [child_row.assign_to],
                description: `Assigned for activity: ${child_row.activity || "Not specified"}`,
                priority: "High"
            },
            callback: function(r) {
                if (!r.exc) {
                    frappe.msgprint(`Document assigned to ${child_row.assign_to} successfully!`);
                } else {
                    frappe.msgprint("Error assigning document: " + r.exc);
                }
            }
        });
    });
}

function update_todo_statuses(frm) {
    if (!frm.doc.table_sumu || !frm.doc.table_sumu.length) return;

    let changes_made = false;
    let promises = [];

    frm.doc.table_sumu.forEach(function(child_row) {
        if (child_row.assign_to) {
            let promise = frappe.db.get_list('ToDo', {
                filters: {
                    reference_type: frm.doctype,
                    reference_name: frm.docname,
                    allocated_to: child_row.assign_to
                },
                fields: ['name', 'status', 'description'],
                limit: 1
            }).then(function(todos) {
                if (todos && todos.length) {
                    // Update status if changed
                    if (child_row.status !== todos[0].status) {
                        frappe.model.set_value(child_row.doctype, child_row.name, 'status', todos[0].status);
                        console.log(`Updated status for row ${child_row.idx} to ${todos[0].status}`);
                        changes_made = true;

                        let child = frm.add_child('note');
                        child.comment_type = 'General Comment';
                        child.comment = todos[0].description || `Task for ${child_row.activity} updated`;
                        child.added_by = frappe.session.user;
                        child.created_on = frappe.datetime.now_datetime();
                        frm.refresh_field('note');
                    }
                    
                    if (frappe.meta.has_field(child_row.doctype, 'todo') &&
                        (!child_row.todo || child_row.todo !== todos[0].name)) {
                        frappe.model.set_value(child_row.doctype, child_row.name, 'todo', todos[0].name);
                        console.log(`Updated todo for row ${child_row.idx} to ${todos[0].name}`);
                        changes_made = true;
                    }
                    

                    if (frappe.meta.has_field(child_row.doctype, 'todo_name') &&
                        (!child_row.todo_name || child_row.todo_name !== todos[0].name)) {
                        frappe.model.set_value(child_row.doctype, child_row.name, 'todo_name', todos[0].name);
                        changes_made = true;
                    }
                }
            });

            promises.push(promise);
        }
    });

    Promise.all(promises).then(function() {
        if (changes_made) {
            setTimeout(function() {
                frm.save();
            }, 1000);
        }
    });
}
function updateSubsequentDates(frm, cdt, cdn) {
	const rows = frm.doc.table_sumu || [];
	const changedRow = locals[cdt][cdn];
	const changedRowIdx = rows.findIndex(row => row.name === cdn);

	if (changedRowIdx === -1 || changedRowIdx === rows.length - 1) return;

	const changedDate = frappe.datetime.str_to_obj(changedRow.date);

	for (let i = changedRowIdx + 1; i < rows.length; i++) {
		const daysToAdd = i - changedRowIdx;
		const newDate = frappe.datetime.add_days(changedRow.date, daysToAdd);
		frappe.model.set_value(cdt, rows[i].name, 'date', newDate, () => {
			// Call calculateRequiredLeadTime after updating subsequent dates
			calculateRequiredLeadTime(frm);
		});
	}

	frm.refresh_field('table_sumu');
}

function calculateRequiredLeadTime(frm) {
	// 1. Retrieve the last row date from table_sumu
	let tableData = frm.doc.table_sumu; // Access the table data directly from the document using the correct table name

	if (tableData && tableData.length > 0) {
		let lastRow = tableData[tableData.length - 1];
		let lastRowDate = frappe.datetime.str_to_obj(lastRow.date); // Use frappe.datetime.str_to_obj for parsing dates

		// 2. Retrieve the acceptance_date from Details tab
		let acceptanceDate = frappe.datetime.str_to_obj(frm.doc.acceptance_date);

		if(acceptanceDate && lastRowDate){
			// 3. Calculate the difference in days
			let timeDiff = lastRowDate.getTime() - acceptanceDate.getTime();
			let diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
            frm.doc.requested_lead_time = diffDays;

			frm.set_value('requested_lead_time', diffDays + " Days");
		} else {
			frm.set_value('requested_lead_time', null);
		}
	} else {
		frm.set_value('requested_lead_time', null);
	}
}


function updateCompletionInfo(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    const today = frappe.datetime.now_date();

    // Format today's date and original date
    const formattedToday = frappe.datetime.str_to_user(today);
    const formattedOriginal = row.date ? frappe.datetime.str_to_user(row.date) : null;

    // Update standard_date_overdue to today's date if different
    if (row.standard_date_overdue !== today) {
        frappe.model.set_value(cdt, cdn, 'standard_date_overdue', today);
    }

    // Update remark with formatted date
    const originalDate = formattedOriginal ? ` (Original: ${formattedOriginal})` : '';
    const newRemark = "Completed";

    if (!row.remark || row.remark !== newRemark) {
        frappe.model.set_value(cdt, cdn, 'remark', newRemark);
    }

    calculateRequiredLeadTime(frm);
}


function updateSubsequentDates(frm, cdt, cdn) {
    const rows = frm.doc.table_sumu || [];
    const changedRow = locals[cdt][cdn];
    const changedRowIdx = rows.findIndex(row => row.name === cdn);

    if (changedRowIdx === -1 || changedRowIdx === rows.length - 1) return;

    const changedDate = frappe.datetime.str_to_obj(changedRow.standard_date_overdue);
    if (!changedDate) return;

    // Step 1: Get employee holiday list
    frappe.call({
        method: 'frappe.client.get_value',
        args: {
            doctype: 'Employee',
            filters: { user_id: frappe.session.user },
            fieldname: 'holiday_list'
        },
        callback: function(empRes) {
            if (!empRes.message || !empRes.message.holiday_list) {
                frappe.msgprint({
                    title: __('Error'),
                    indicator: 'red',
                    message: __('No holiday list found for the employee.')
                });
                return;
            }

            let holiday_list = empRes.message.holiday_list;

            // Step 2: Get holiday dates
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Holiday List',
                    name: holiday_list
                },
                callback: function(holidayRes) {
                    let holidays = (holidayRes.message.holidays || []).map(h => h.holiday_date);

                    // Step 3: Update subsequent dates
                    for (let i = changedRowIdx + 1; i < rows.length; i++) {
                        const daysToAdd = rows[i].day - rows[i - 1].day;
                        const newDate = getNextWorkingDate(changedDate, holidays, daysToAdd);
                        if (newDate) {
                            frappe.model.set_value(cdt, rows[i].name, 'standard_date_overdue', newDate);
                            changedDate = frappe.datetime.str_to_obj(newDate); // Update changedDate for the next iteration
                        }
                    }

                    frm.refresh_field('table_sumu');
                }
            });
        }
    });
}
function calculateRequiredLeadTime(frm) {
    let tableData = frm.doc.table_sumu;
    if (tableData && tableData.length > 0) {
        let lastRow = tableData[tableData.length - 1];
        let lastRowDate = frappe.datetime.str_to_obj(lastRow.standard_date_overdue);
        let acceptanceDate = frappe.datetime.str_to_obj(frm.doc.acceptance_date);

        if (acceptanceDate && lastRowDate) {
            let timeDiff = lastRowDate.getTime() - acceptanceDate.getTime();
            let diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
            frm.set_value('requested_lead_time', diffDays + " Days");
        } else {
            frm.set_value('requested_lead_time', null);
        }
    } else {
        frm.set_value('requested_lead_time', null);
    }

    updateOverdueRemarks(frm);
}

function updateOverdueRemarks(frm) {
    const today = frappe.datetime.now_date();
    const todayDate = frappe.datetime.str_to_obj(today);
    const rows = frm.doc.table_sumu || [];

    rows.forEach(row => {
        const isCompleted = row.status === 'Close' || row.activity_status === 'Completed';

        if (!isCompleted && row.standard_date_overdue) {
            const dueDate = frappe.datetime.str_to_obj(row.standard_date_overdue);

            if (dueDate && todayDate > dueDate) {
                const overdueDays = frappe.datetime.get_diff(todayDate, dueDate);

                // Format original date in DD-MM-YYYY
                const originalDateFormatted = frappe.datetime.str_to_user(row.date);

                const newRemark = `${overdueDays} day(s) overdue (Original: ${originalDateFormatted})`;

                if (!row.remark || !row.remark.includes("overdue") || row.remark !== newRemark) {
                    frappe.model.set_value(row.doctype, row.name, 'remark', newRemark);
                }
            } else if (row.remark && row.remark.includes("overdue")) {
                frappe.model.set_value(row.doctype, row.name, 'remark', '');
            }
        }
    });

    frm.refresh_field('table_sumu');
}

function getNextWorkingDate(startDate, holidays, daysToAdd) {
    if (!startDate) return null;
    let date = frappe.datetime.str_to_obj(startDate);
    if (!date) return null;

    let added = 0;
    while (added < daysToAdd) {
        date = frappe.datetime.add_days(date, 1);
        const dateStr = frappe.datetime.obj_to_str(date);
        if (!holidays.includes(dateStr)) {
            added++;
        }
    }
    return frappe.datetime.obj_to_str(date);
}




frappe.ui.form.on("Biofoundry Job Card Detail", {
	job_card: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.job_card) return;

		frappe.call({
			method: "frappe.client.get_value",
			args: {
				doctype: "Job Card",
				filters: { name: row.job_card },
				fieldname: ["operation", "workstation", "status"]
			},
			callback: function(r) {
				if (r.message) {
					frappe.model.set_value(cdt, cdn, "operation", r.message.operation);
					frappe.model.set_value(cdt, cdn, "workstation", r.message.workstation);
					frappe.model.set_value(cdt, cdn, "status", r.message.status);
				}
			}
		});
	},

	start_job: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.job_card) {
			frappe.msgprint(__("Please select a Job Card first"));
			return;
		}

		frappe.prompt([
			{
				fieldtype: "Datetime",
				label: __("Start Time"),
				fieldname: "start_time",
				reqd: 1,
				default: frappe.datetime.now_datetime()
			},
			{
				fieldtype: "Link",
				options: "Employee",
				label: __("Operator"),
				fieldname: "employee"
			}
		], function(data) {
			frappe.call({
				method: "biofoundary.biofoundary.doctype.material_request_for_biofoundry.material_request_for_biofoundry.start_job",
				args: {
					job_card_name: row.job_card,
					start_time: data.start_time,
					employee: data.employee
				},
				callback: function(r) {
					if (r.message) {
						frappe.model.set_value(cdt, cdn, "start_time", data.start_time);
						frappe.model.set_value(cdt, cdn, "status", r.message.status);
						frappe.show_alert({ message: __("Job started successfully"), indicator: "green" });
						frm.refresh();
					}
				}
			});
		}, __("Start Job"), __("Start"));
	},

	complete_job: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (!row.job_card) {
			frappe.msgprint(__("Please select a Job Card first"));
			return;
		}

		frappe.prompt([
			{
				fieldtype: "Float",
				label: __("Completed Quantity"),
				fieldname: "qty",
				reqd: 1,
				default: 1
			},
			{
				fieldtype: "Datetime",
				label: __("End Time"),
				fieldname: "end_time",
				reqd: 1,
				default: frappe.datetime.now_datetime()
			}
		], function(data) {
			if (data.qty <= 0) {
				frappe.throw(__("Quantity should be greater than 0"));
				return;
			}

			frappe.call({
				method: "biofoundary.biofoundary.doctype.material_request_for_biofoundry.material_request_for_biofoundry.complete_job_card",
				args: {
					job_card: row.job_card,
					qty: data.qty,
					end_time: data.end_time
				},
				callback: function(r) {
					if (r.message) {
						frappe.model.set_value(cdt, cdn, "end_time", data.end_time);
						frappe.model.set_value(cdt, cdn, "completed_qty", data.qty);
						frappe.model.set_value(cdt, cdn, "status", r.message.status);
						frappe.show_alert({ message: __("Job completed successfully"), indicator: "green" });
						frm.refresh();
					}
				}
			});
		}, __("Complete Job"), __("Complete"));
	}
});






frappe.ui.form.on('Biofoundary Plasmid Kit', {
	date(frm, cdt, cdn) {
		if (!frappe.user_roles.includes('Manufacturing Manager')) {
			frappe.msgprint({
				title: __('Permission Denied'),
				indicator: 'red',
				message: __('Only Manufacturing Manager can modify the date field.')
			});
			const row = locals[cdt][cdn];
			frappe.model.set_value(cdt, cdn, 'date', row.__original_date || row.date);
		} else {
			const row = locals[cdt][cdn];
			row.__original_date = row.date;
			updateSubsequentDates(frm, cdt, cdn);
		}
		// Call calculateRequiredLeadTime when any date in the table changes
		frappe.model.set_value(cdt, cdn, 'date', locals[cdt][cdn].date, () => {
			calculateRequiredLeadTime(frm);
		});
	},
	onload_post_render(frm, cdt, cdn) {
		const row = locals[cdt][cdn];
		row.__original_date = row.date;
	},

    standard_date_overdue(frm, cdt, cdn) {
        const row = locals[cdt][cdn];

        // Role check
        if (!frappe.user_roles.includes('Manufacturing Manager')) {
            frappe.msgprint({
                title: __('Permission Denied'),
                indicator: 'red',
                message: __('Only Manufacturing Manager can modify the date field.')
            });
            frappe.model.set_value(cdt, cdn, 'standard_date_overdue', row.__original_standard_date || row.standard_date_overdue);
            return;
        }

        const previousDate = row.__original_standard_date;
        const newDate = row.standard_date_overdue;

        if (previousDate && previousDate !== newDate) {
            const currentUser = frappe.session.user_fullname || frappe.session.user;
            const remarkText = `Date changed from ${previousDate} to ${newDate} by ${currentUser}`;

            frappe.model.set_value(cdt, cdn, 'remark', remarkText).then(() => {
                const gridRow = frm.fields_dict.table_sumu.grid.get_row(cdn);
                if (gridRow) {
                    gridRow.toggle_editable('remark', false);
                }
            });
        }

        row.__original_standard_date = newDate;
        updateSubsequentDates(frm, cdt, cdn);
        calculateRequiredLeadTime(frm);
    },

    activity_status(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        // If activity_status is set to Completed, set status to Close
        if (row.activity_status === 'Completed') {
            frappe.model.set_value(cdt, cdn, 'status', 'Close');
            updateCompletionInfo(frm, cdt, cdn);
        }
    },

    status(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        // If status is set to Close, set activity_status to Completed
        if (row.status === 'Close') {
            frappe.model.set_value(cdt, cdn, 'activity_status', 'Completed');
            updateCompletionInfo(frm, cdt, cdn);
        }
    },

    onload_post_render(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        row.__original_standard_date = row.standard_date_overdue;

        if (row.remark) {
            const gridRow = frm.fields_dict.table_sumu.grid.get_row(cdn);
            if (gridRow) {
                gridRow.toggle_editable('remark', false);
            }
        }
    }

});



frappe.ui.form.on('Biofoundary child', {
    item_detail_add: function(frm, cdt, cdn) {
        frm.fields_dict.item_detail.grid.get_field('item').get_query = function(doc, cdt, cdn) {
            return {
                filters: {
                    custom_biofoundary_type: frm.doc.biofoundary_type || ""
                }
            };
        };
    }
});
