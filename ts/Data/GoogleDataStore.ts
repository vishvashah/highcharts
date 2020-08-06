/* *
 *
 *  Data module
 *
 *  (c) 2012-2020 Torstein Honsi
 *
 *  License: www.highcharts.com/license
 *
 *  !!!!!!! SOURCE GETS TRANSPILED BY TYPESCRIPT. EDIT TS FILE ONLY. !!!!!!!
 *
 * */

'use strict';

import AjaxMixin from '../Extensions/Ajax.js';
const {
    ajax
} = AjaxMixin;
import DataTable from './DataTable.js';
import DataStore from './DataStore.js';
import DataParser from './Parsers/DataParser.js';
import U from '../Core/Utilities.js';
const {
    fireEvent,
    merge
} = U;

import type DataValueType from './DataValueType.js';

/** eslint-disable valid-jsdoc */

/**
 * @private
 */

class GoogleDataStore extends DataStore {

    /* *
     *
     *  Static Properties
     *
     * */

    protected static readonly defaultOptions: GoogleDataStore.Options = {
        googleSpreadsheetKey: '',
        worksheet: 1,
        startColumn: 0,
        endColumn: Number.MAX_VALUE,
        startRow: 0,
        endRow: Number.MAX_VALUE,
        enablePolling: false,
        dataRefreshRate: 2
    };

    /* *
     *
     *  Constructors
     *
     * */

    public constructor(
        table: DataTable,
        options: (
            Partial<GoogleDataStore.Options>&
            { googleSpreadsheetKey: string }
        )
    ) {
        super(table);

        this.options = merge(GoogleDataStore.defaultOptions, options);
        this.columns = [];
    }

    /* *
     *
     *  Properties
     *
     * */

    public columns: Array<Array<DataValueType>>;
    public options: GoogleDataStore.Options;
    private dataParser = new DataParser();

    /* *
     *
     *  Functions
     *
     * */

    private getSheetColumns(json: Highcharts.JSONType): Array<Array<DataValueType>> {
        const store = this,
            {
                startColumn,
                endColumn,
                startRow,
                endRow
            } = store.options,
            columns: Array<Array<DataValueType>> = [],
            cells = json.feed.entry,
            cellCount = (cells || []).length;

        let cell,
            colCount = 0,
            rowCount = 0,
            val,
            gr,
            gc,
            cellInner,
            i: number,
            j: number;

        // First, find the total number of columns and rows that
        // are actually filled with data
        for (i = 0; i < cellCount; i++) {
            cell = cells[i];
            colCount = Math.max(colCount, cell.gs$cell.col);
            rowCount = Math.max(rowCount, cell.gs$cell.row);
        }

        // Set up arrays containing the column data
        for (i = 0; i < colCount; i++) {
            if (i >= startColumn && i <= endColumn) {
                // Create new columns with the length of either
                // end-start or rowCount
                columns[i - startColumn] = [];
            }
        }

        // Loop over the cells and assign the value to the right
        // place in the column arrays
        for (i = 0; i < cellCount; i++) {
            cell = cells[i];
            gr = cell.gs$cell.row - 1; // rows start at 1
            gc = cell.gs$cell.col - 1; // columns start at 1

            // If both row and col falls inside start and end set the
            // transposed cell value in the newly created columns
            if (gc >= startColumn && gc <= endColumn &&
                gr >= startRow && gr <= endRow) {

                cellInner = cell.gs$cell || cell.content;

                val = null;

                if (cellInner.numericValue) {
                    if (cellInner.$t.indexOf('/') >= 0 ||
                        cellInner.$t.indexOf('-') >= 0) {
                        // This is a date - for future reference.
                        val = cellInner.$t;
                    } else if (cellInner.$t.indexOf('%') > 0) {
                        // Percentage
                        val = parseFloat(cellInner.numericValue) * 100;
                    } else {
                        val = parseFloat(cellInner.numericValue);
                    }
                } else if (cellInner.$t && cellInner.$t.length) {
                    val = cellInner.$t;
                }

                columns[gc - startColumn][gr - startRow] = val;
            }
        }

        // Insert null for empty spreadsheet cells (#5298)
        for (i = 0; i < colCount; i++) {
            for (j = 0; j < cellCount; i++) {
                if (typeof columns[i][j] === 'undefined') {
                    columns[i][j] = null as any;
                }
            }
        }

        return columns;
    }

    private parseSheet(json: Highcharts.JSONType): (boolean|undefined) {
        var store = this,
            cells = json.feed.entry,
            columns: Array<Array<DataValueType>> = [];

        if (!cells || cells.length === 0) {
            return false;
        }

        fireEvent(
            store,
            'parse',
            { json },
            function (): void {
                columns = store.getSheetColumns(json);
                store.columns = columns;

                fireEvent(store, 'afterParse', { columns });
            }
        );
    }

    private fetchSheet(): void {
        const store = this,
            headers: string[] = [],
            {
                enablePolling,
                dataRefreshRate,
                googleSpreadsheetKey,
                worksheet
            } = store.options,
            url = [
                'https://spreadsheets.google.com/feeds/cells',
                googleSpreadsheetKey,
                worksheet,
                'public/values?alt=json'
            ].join('/');

        let i: number,
            colsCount: number;

        ajax({
            url: url,
            dataType: 'json',
            success: function (json: Highcharts.JSONType): void {

                fireEvent(
                    store,
                    'load',
                    { json, enablePolling, dataRefreshRate },
                    function (): void {
                        store.parseSheet(json);
                        colsCount = store.columns.length;

                        for (i = 0; i < colsCount; i++) {
                            headers.push('' + store.columns[i][0]);
                        }

                        const table = store.dataParser.columnArrayToDataTable(store.columns, headers);

                        // Polling
                        if (enablePolling) {
                            setTimeout(
                                function (): void {
                                    store.fetchSheet();
                                },
                                dataRefreshRate * 1000
                            );
                        }

                        fireEvent(store, 'afterLoad', { table });
                    }
                );
            },
            error: function (
                xhr: XMLHttpRequest,
                text: (string|Error)
            ): void {
                /* *
                 * TODO:
                 * catch error
                 * ...
                 *
                 * */
                // console.log(text);

                fireEvent(store, 'fail', { text });
            }
        });

        // return true;
    }

    public load(): void {
        return this.options.googleSpreadsheetKey ?
            this.fetchSheet() : void 0;
    }
    /* *
     * TODO:
     * public save() {}
     * ...
     *
     * requires oAuth2 auth
     *
     * */
}

namespace GoogleDataStore {

    export interface Options {
        googleSpreadsheetKey: string;
        worksheet: number;
        startRow: number;
        endRow: number;
        startColumn: number;
        endColumn: number;
        enablePolling: boolean;
        dataRefreshRate: number;
    }

}

export default GoogleDataStore;
