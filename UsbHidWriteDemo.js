//Use Node-hid lib, you need setup node-hid first
var coroutine = require("coroutine");
var HID = require('node-hid');
var devices = HID.devices();

console.log('devices:', HID.devices());  //list USB-HID

var deviceInfo = devices.find( function(d) {
    var isTeensy = d.vendorId===0x1a86 && d.productId===0xe010;  //Our HID VID=0x1A86 and PID=0xE010
    var isKbd = d.path.includes('kbd');
    if(isTeensy && isKbd === false)  //scan reader and not keyboard device
        return d.path;
    else return null;
});

function sleep(delay) {
    var start = new Date().getTime();
    while (new Date().getTime() < start + delay)
        ;
}

function ShowTagData(data){

}

function CheckSum(data, iNum) {
    var bSum = 0x00;
    var iIndex = 0;
    for(iIndex = 2; iIndex < iNum; iIndex++)
    {
        bSum = bSum + data[iIndex];
    }
    bSum = ~bSum + 1;
    var buf = Buffer.alloc(4, 'hex');
    buf.writeInt32BE(bSum);
    return buf[3];
}

if( deviceInfo ) {
    var bSum = 0x00;

    var device = new HID.HID(deviceInfo.path);
    try {
        console.log("open success");
        device.sendFeatureReport([0x00,0xFF, 0xC7, 0x83, 0xCC, 0x30, 0x00]);  //Open USB-Hid must set usb feature value first
    } catch(err) {
        console.log("open failed");
    }
    //device.write([0x00, 0x07, 0x53, 0x57, 0x00, 0x03,0xFF,0x10,0x44]);    //Read Reader system Info
    //sleep(200);
    //device.gotData = function (err, data) {
    //pucSystemInfo:SysInfo  9Bytes 1:SoftVer 2:HardVer 3 - 9:DeviceSN
    //        console.log("softver:",data[8].toString(16));
    //         console.log("hardver:",data[9].toString(16));
    //         console.log("DevSN:",data[10].toString(16),data[11].toString(16),data[12].toString(16),data[13].toString(16),
    //     data[14].toString(16),data[15].toString(16),data[16].toString(16));
    //}
    // device.read(device.gotData.bind(device));
    //Need Sleep 200 ms
    //device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x24,0x05,0x1A,0x0F]);  //Set RF Power RF = 0x24 / 26 dbm
    //device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x24,0x05,0x07,0x22]);    //Set RF Power RF = 0x07 / 7 dbm
    device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x24,0x05,0x11,0x18]);    //Set RF Power RF = 0x11 / 17 dbm
    //Need Sleep 200 ms
    sleep(200);
    //device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x24,0x02,0x01,0x2B]);    //Set ActiveMode
    device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x24,0x02,0x00,0x2C]);    //Set AnswerMode
    //Need Sleep 200 ms
    sleep(200);
    //device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x3F,0x31,0x80,0x62]);   //Set Freq.  US band
    //device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x3F,0x4E,0x00,0xC5]);   //Set Freq.  EU band
    //sleep(200);
    device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x24,0x0A,0x00,0x24]);   //ScanArea :  EPC
    //device.write([0x00, 0x09, 0x53, 0x57, 0x00, 0x05,0xFF,0x24,0x0A,0x01,0x23]);   //ScanArea :  TID
    sleep(200);


    //Write User Area
    //Send:53 57 00 16 FF  03 01 02 06  00 00 00 00 00 11  22 33 44 55 66  77 88 99 AA BB  D3
    var WriteData = Buffer.alloc(28,'hex');
    WriteData[0] = 0x00; //USB head
    WriteData[1] = 26;  //USB send length, if you want to send more, add it (byte)
    WriteData[2] = 0x53;
    WriteData[3] = 0x57; //company protocol head
    WriteData[4] = 0x00;
    WriteData[5] = 0x16;  //protocol length, if you want to write more, add it(byte)
    WriteData[6] = 0xFF; //default value , not change it
    WriteData[7] = 0x03; //Write Command , not change it
    WriteData[8] = 0x03; //01:Region(0 reserved,1 EPC,2 TID,3 User)  user area
    WriteData[9] = 0x00; //StartAdd (Word) mean start write address
    WriteData[10] = 0x06; //Write Length (Word), 06 mean 12bytes
    WriteData[11] = WriteData[12] = WriteData[13] = WriteData[14] = 0x00;  //Tag password 4 bytes
    //write content
    WriteData[15] = 0x00;WriteData[16] = 0x11; WriteData[17] = 0x22; WriteData[18] = 0x33;
    WriteData[19] = 0x44;WriteData[20] = 0x55; WriteData[21] = 0x66; WriteData[22] = 0x77;
    WriteData[23] = 0x88;WriteData[24] = 0x99; WriteData[25] = 0xAA; WriteData[26] = 0xBB;
    WriteData[27] = CheckSum(WriteData,27); //Get Sum Value

    while(1)
    {
       if(device.write(WriteData) == 1)
           console.log('write: success');
       else console.log('write: failed');
        sleep(2000);
    }



    //Rev TagData
    //var rxdata = 0;
    //var rxstate = 0;
    //var bReadLength = 0;
    //var strTagID = "";
    //device.on('data', function(data) {
    //    if(data[0] === 0);
    //    else {
    //        if(data[1] === 0x43 && data[2] === 0x54 && data[6] === 0x45)  //active data
    //        {
    //            console.log('tag:', data);  //data[15]: TagNum   data[16]: singleTagLength( include 1 byte type and 1 byte ant and 1 byte rssi
    //                                        //data[17] == 0x01: Tag Type   data[18]: AntNum  data[19]..[30]: TagContent data[31]:RSSI
    //                                        //if data[17] == 0x81 with TimeStamp, last 6 bytes is time
    //        }
    //    }

    //});
}

